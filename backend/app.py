from flask import Flask, jsonify, request, make_response
import os, re, jwt, datetime, html, json
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from dotenv import load_dotenv

load_dotenv()


# ─── LOGGING ─────────────────────────────────────────────────────────────────
import logging, sys

ENV = os.getenv('ENV', 'development')


# ─── SENTRY (error monitoring) ───────────────────────────────────────────────
SENTRY_DSN = os.getenv('SENTRY_DSN', '')
if SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.flask import FlaskIntegration
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[FlaskIntegration()],
        environment=ENV,
        traces_sample_rate=0.2,        # 20% of requests traced for performance
        profiles_sample_rate=0.1,      # 10% profiling
        send_default_pii=False,        # GDPR-safe: no personal data in events
    )
    print(f"[buycars] Sentry enabled (env={ENV})")
else:
    print("[buycars] Sentry DSN not set — error monitoring disabled")

logging.basicConfig(
    level=logging.DEBUG if ENV != 'production' else logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger('buycars')

# ─── ENV-BASED CONFIG ─────────────────────────────────────────────────────────
class Config:
    SECRET_KEY      = os.getenv('SECRET_KEY', 'buycars_dev_secret_change_in_production')
    DEBUG           = False
    TESTING         = False
    LOG_LEVEL       = logging.INFO

class DevelopmentConfig(Config):
    DEBUG     = True
    LOG_LEVEL = logging.DEBUG

class ProductionConfig(Config):
    DEBUG     = False
    LOG_LEVEL = logging.INFO

config_map = {
    'production':  ProductionConfig,
    'development': DevelopmentConfig,
    'testing':     DevelopmentConfig,
}
AppConfig = config_map.get(ENV, DevelopmentConfig)
logger.info(f"Starting buycars in [{ENV}] mode")

app = Flask(__name__)
app.config['SECRET_KEY'] = AppConfig.SECRET_KEY
app.config['DEBUG']      = AppConfig.DEBUG

# 🔥 ADD THIS BLOCK


# ─── ALLOWED ORIGINS ────────────────────────────────────────────────────────
ALLOWED_ORIGINS = [o.strip() for o in os.getenv('ALLOWED_ORIGINS', 'http://localhost:5173').split(',')]

# ─── REDIS CACHE (optional — gracefully disabled if not configured) ──────────
REDIS_URL = os.getenv('REDIS_URL', '')
_redis = None

def get_redis():
    """Return a live Redis client, or None if Redis is not configured / unreachable."""
    global _redis
    if _redis is not None:
        return _redis
    if not REDIS_URL:
        return None
    try:
        import redis as _redis_lib
        client = _redis_lib.from_url(REDIS_URL, socket_connect_timeout=2, socket_timeout=2, decode_responses=True)
        client.ping()
        _redis = client
        logger.info("[cache] Redis connected — caching enabled")
        return _redis
    except Exception as e:
        logger.warning(f"[cache] Redis unavailable ({e}) — running without cache")
        return None

CACHE_TTL_SEARCH  = int(os.getenv('CACHE_TTL_SEARCH', 60))
CACHE_TTL_STATS   = int(os.getenv('CACHE_TTL_STATS',  120))
CACHE_TTL_OEM     = int(os.getenv('CACHE_TTL_OEM',    300))

def cache_get(key):
    r = get_redis()
    if not r: return None
    try:
        val = r.get(key)
        return json.loads(val) if val else None
    except Exception:
        return None

def cache_set(key, value, ttl=60):
    r = get_redis()
    if not r: return
    try:
        r.setex(key, ttl, json.dumps(value, default=str))
    except Exception:
        pass

def cache_delete_pattern(pattern):
    """Invalidate all cache keys matching a glob pattern (e.g. 'inv:*')."""
    r = get_redis()
    if not r: return
    try:
        keys = r.keys(pattern)
        if keys:
            r.delete(*keys)
    except Exception:
        pass

# ─── RATE LIMITER ────────────────────────────────────────────────────────────
_limiter_storage = REDIS_URL if REDIS_URL else "memory://"
limiter = Limiter(key_func=get_remote_address, app=app, default_limits=[], storage_uri=_limiter_storage,
    enabled=os.getenv("TESTING","0") != "1")

# ─── DATABASE (PostgreSQL or SQLite fallback) ────────────────────────────────
DATABASE_URL = os.getenv('DATABASE_URL')

if DATABASE_URL:
    import psycopg2, psycopg2.extras
    def get_db():
        return psycopg2.connect(DATABASE_URL)
    def fetchall(cursor):
        cols = [d[0] for d in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]
    def fetchone(cursor):
        if not cursor.description: return None
        cols = [d[0] for d in cursor.description]
        row = cursor.fetchone()
        return dict(zip(cols, row)) if row else None
    PH = '%s'
    DB_TYPE = 'postgres'
else:
    import sqlite3
    DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'buycars.db')
    def get_db():
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn
    def fetchall(cursor):
        return [dict(r) for r in cursor.fetchall()]
    def fetchone(cursor):
        row = cursor.fetchone()
        return dict(row) if row else None
    PH = '?'
    DB_TYPE = 'sqlite'

def ph(n=1):
    return ','.join([PH] * n)

def scalar(cursor, sql, params=None):
    cursor.execute(sql, params or [])
    r = cursor.fetchone()
    return (list(r.values())[0] if isinstance(r, dict) else r[0]) if r else 0


# ─── CORS ────────────────────────────────────────────────────────────────────
@app.after_request
def add_cors(response):
    origin = request.headers.get('Origin', '')
    allow  = origin if origin in ALLOWED_ORIGINS else ALLOWED_ORIGINS[0]
    response.headers['Access-Control-Allow-Origin']  = allow
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS'
    response.headers['Vary'] = 'Origin'
    return response


# ─── REQUEST LOGGING ─────────────────────────────────────────────────────────
@app.before_request
def log_request():
    if not request.path.startswith('/api/health'):
        logger.info(f"{request.method} {request.path} — ip:{request.remote_addr}")

@app.after_request
def log_response(response):
    if not request.path.startswith('/api/health') and response.status_code >= 400:
        logger.warning(f"{request.method} {request.path} → {response.status_code}")
    return response

@app.before_request
def handle_preflight():
    if request.method == 'OPTIONS':
        res    = make_response()
        origin = request.headers.get('Origin', '')
        res.headers['Access-Control-Allow-Origin']  = origin if origin in ALLOWED_ORIGINS else ALLOWED_ORIGINS[0]
        res.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
        res.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS'
        res.headers['Vary'] = 'Origin'
        return res, 204


# ─── INPUT SANITIZATION ──────────────────────────────────────────────────────
def sanitize(v):
    if not isinstance(v, str): return v
    return html.escape(re.sub(r'<[^>]+>', '', v)).strip()

def sanitize_dict(d, keys):
    for k in keys:
        if k in d and isinstance(d[k], str):
            d[k] = sanitize(d[k])
    return d


# ─── DB INIT ─────────────────────────────────────────────────────────────────
def init_db():
    conn = get_db()
    c = conn.cursor()
    if DB_TYPE == 'postgres':
        c.execute('''CREATE TABLE IF NOT EXISTS Users (
            user_id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL, role TEXT DEFAULT 'dealer',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
        c.execute('''CREATE TABLE IF NOT EXISTS OEM_Specs (
            oem_id SERIAL PRIMARY KEY, make TEXT NOT NULL, model TEXT NOT NULL,
            year INTEGER NOT NULL, list_price REAL NOT NULL, available_colors TEXT NOT NULL,
            mileage_kmpl REAL NOT NULL, power_bhp REAL NOT NULL,
            max_speed_kmph INTEGER NOT NULL, fuel_type TEXT NOT NULL, transmission TEXT NOT NULL)''')
        c.execute('''CREATE TABLE IF NOT EXISTS Marketplace_Inventory (
            inventory_id SERIAL PRIMARY KEY,
            dealer_id INTEGER NOT NULL REFERENCES Users(user_id),
            oem_id INTEGER NOT NULL REFERENCES OEM_Specs(oem_id),
            title TEXT NOT NULL, description TEXT NOT NULL,
            asking_price REAL NOT NULL, color TEXT NOT NULL,
            odometer_km INTEGER NOT NULL, major_scratches INTEGER DEFAULT 0,
            original_paint BOOLEAN DEFAULT TRUE, accidents_reported INTEGER DEFAULT 0,
            previous_buyers INTEGER DEFAULT 0, registration_place TEXT NOT NULL,
            image_url TEXT, listed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
    else:
        c.execute('''CREATE TABLE IF NOT EXISTS Users (
            user_id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'dealer', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)''')
        c.execute('''CREATE TABLE IF NOT EXISTS OEM_Specs (
            oem_id INTEGER PRIMARY KEY AUTOINCREMENT, make TEXT NOT NULL, model TEXT NOT NULL,
            year INTEGER NOT NULL, list_price REAL NOT NULL, available_colors TEXT NOT NULL,
            mileage_kmpl REAL NOT NULL, power_bhp REAL NOT NULL,
            max_speed_kmph INTEGER NOT NULL, fuel_type TEXT NOT NULL, transmission TEXT NOT NULL)''')
        c.execute('''CREATE TABLE IF NOT EXISTS Marketplace_Inventory (
            inventory_id INTEGER PRIMARY KEY AUTOINCREMENT,
            dealer_id INTEGER NOT NULL REFERENCES Users(user_id),
            oem_id INTEGER NOT NULL REFERENCES OEM_Specs(oem_id),
            title TEXT NOT NULL, description TEXT NOT NULL,
            asking_price REAL NOT NULL, color TEXT NOT NULL,
            odometer_km INTEGER NOT NULL, major_scratches INTEGER DEFAULT 0,
            original_paint BOOLEAN DEFAULT 1, accidents_reported INTEGER DEFAULT 0,
            previous_buyers INTEGER DEFAULT 0, registration_place TEXT NOT NULL,
            image_url TEXT, listed_at DATETIME DEFAULT CURRENT_TIMESTAMP)''')
    c.execute("CREATE INDEX IF NOT EXISTS idx_oem ON OEM_Specs(make,model,year)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_inv_dealer ON Marketplace_Inventory(dealer_id)")
    conn.commit()

    # Seed only if empty
    # Check inventory instead of OEM
    c.execute("SELECT COUNT(*) FROM Marketplace_Inventory")
    r = c.fetchone()
    count = list(r.values())[0] if isinstance(r, dict) else r[0]
    if count > 0:
        conn.close()
        return

    pw = generate_password_hash('password123')
    for u in [('Rajesh Kumar','rajesh@dealer.com',pw,'dealer'),
               ('Sunita Sharma','sunita@dealer.com',pw,'dealer'),
               ('Amit Verma','amit@dealer.com',pw,'dealer'),
               ('Admin User','admin@buycars.com',generate_password_hash('admin123'),'admin')]:
        c.execute(f"INSERT INTO Users(name,email,password_hash,role)VALUES({ph(4)})", u)

    for o in [
        ('Honda','City',2015,1050000,'White,Silver,Red,Blue',17.8,118.0,180,'Petrol','Manual'),
        ('Honda','City',2018,1150000,'White,Silver,Red,Blue,Grey',17.8,118.0,180,'Petrol','CVT'),
        ('Honda','City',2021,1195000,'Platinum White,Golden Brown,Lunar Silver',18.4,119.0,180,'Petrol','CVT'),
        ('Maruti','Swift',2016,560000,'Lucent Orange,Pearl Red,Autumn Grey',22.0,83.1,160,'Petrol','Manual'),
        ('Maruti','Swift',2020,625000,'Fire Red,Pearl White,Midnight Black',23.2,89.0,170,'Petrol','AMT'),
        ('Hyundai','Creta',2019,1200000,'Phantom Black,Polar White,Typhoon Silver',17.0,113.4,180,'Petrol','Manual'),
        ('Hyundai','Creta',2022,1425000,'Abyss Black,Atlas White,Titan Grey',14.4,113.4,185,'Petrol','DCT'),
        ('Toyota','Innova',2017,1800000,'White Pearl,Silver Metallic,Bronze Mica',11.0,148.0,170,'Diesel','Manual'),
        ('BMW','3 Series',2019,4200000,'Alpine White,Black Sapphire,Glacier Silver',15.2,190.0,250,'Petrol','Automatic'),
        ('Tata','Nexon',2021,850000,'Flame Red,Calgary White,Daytona Grey',17.0,120.0,180,'Petrol','AMT'),
        ('Mahindra','XUV500',2018,1550000,'Pearl White,Midnight Black,Crimson Red',15.1,140.0,185,'Diesel','Manual'),
        ('Volkswagen','Polo',2017,720000,'Candy White,Deep Black,Reflex Silver',18.7,104.5,185,'Petrol','Manual')]:
        c.execute(f"INSERT INTO OEM_Specs(make,model,year,list_price,available_colors,mileage_kmpl,power_bhp,max_speed_kmph,fuel_type,transmission)VALUES({ph(10)})", o)
    conn.commit()

    c.execute("SELECT user_id FROM Users WHERE role='dealer' ORDER BY user_id")
    dids = [list(r.values())[0] if isinstance(r,dict) else r[0] for r in c.fetchall()]
    c.execute("SELECT oem_id FROM OEM_Specs ORDER BY oem_id")
    oids = [list(r.values())[0] if isinstance(r,dict) else r[0] for r in c.fetchall()]
    d1,d2,d3 = dids[0],dids[1],dids[2]

    # ✅ THIS MUST BE INSIDE FUNCTION
    for l in [
        (d1,oids[0],'Honda City...',620000,'White',52000,0,True,0,1,'Delhi','...'),
        (d1,oids[3],'Maruti Swift...',310000,'Red',78000,1,True,0,2,'Patiala','...'),
        (d2,oids[5],'Hyundai Creta...',850000,'Black',34000,0,True,1,1,'Chandigarh','...'),
        (d2,oids[7],'Toyota Innova...',1150000,'Silver',65000,0,True,0,2,'Mumbai','...'),
        (d3,oids[9],'Tata Nexon...',730000,'Red',18000,0,True,0,1,'Bangalore','...'),
        (d3,oids[1],'Honda City...',780000,'Silver',41000,0,True,0,1,'Hyderabad','...')
    ]:
        c.execute(f"INSERT INTO Marketplace_Inventory(dealer_id,oem_id,title,description,asking_price,color,odometer_km,major_scratches,original_paint,accidents_reported,previous_buyers,registration_place,image_url) VALUES({ph(13)})", l)

    conn.commit()
    conn.close()
    print("Database seeded.")

# ✅ ADD HERE (CORRECT PLACE)
with app.app_context():
    init_db()
    


# ─── AUTH HELPERS ─────────────────────────────────────────────────────────────
def make_tokens(user):
    secret  = app.config['SECRET_KEY']
    access  = jwt.encode({'user_id':user['user_id'],'name':user['name'],'role':user['role'],
                          'exp':datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=1),'type':'access'},
                         secret, algorithm='HS256')
    refresh = jwt.encode({'user_id':user['user_id'],
                          'exp':datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(days=30),'type':'refresh'},
                         secret, algorithm='HS256')
    return access, refresh

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization','').replace('Bearer ','')
        if not token: return jsonify({'error':'Authentication token required'}),401
        try:
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
            request.user_id   = data['user_id']
            request.user_role = data.get('role','dealer')
        except jwt.ExpiredSignatureError:
            return jsonify({'error':'Token expired','code':'TOKEN_EXPIRED'}),401
        except jwt.InvalidTokenError:
            return jsonify({'error':'Invalid token'}),401
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization','').replace('Bearer ','')
        if not token: return jsonify({'error':'Authentication token required'}),401
        try:
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
            if data.get('role') != 'admin': return jsonify({'error':'Admin access required'}),403
            request.user_id = data['user_id']; request.user_role = 'admin'
        except jwt.ExpiredSignatureError:
            return jsonify({'error':'Token expired','code':'TOKEN_EXPIRED'}),401
        except jwt.InvalidTokenError:
            return jsonify({'error':'Invalid token'}),401
        return f(*args, **kwargs)
    return decorated


# ─── VALIDATION ──────────────────────────────────────────────────────────────
def is_valid_email(e):
    return re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', e) is not None

def validate_inventory(data):
    errors = {}
    for k in ['oem_id','title','asking_price','color','odometer_km','registration_place']:
        if k not in data or str(data[k]).strip() == '': errors[k] = f'{k} is required'
    if 'asking_price' in data:
        try:
            p = float(data['asking_price'])
            if p <= 0: errors['asking_price'] = 'Price must be > 0'
            elif p > 1e8: errors['asking_price'] = 'Price too high'
        except: errors['asking_price'] = 'Price must be a number'
    if 'odometer_km' in data:
        try:
            k = int(data['odometer_km'])
            if k < 0: errors['odometer_km'] = 'Cannot be negative'
            elif k > 2000000: errors['odometer_km'] = 'Too high'
        except: errors['odometer_km'] = 'Must be a whole number'
    if 'title' in data and len(str(data.get('title','')).strip()) < 5:
        errors['title'] = 'Title must be at least 5 characters'
    return errors


# ─── AUTH ROUTES ─────────────────────────────────────────────────────────────
@app.route('/api/auth/signup', methods=['POST'])
@limiter.limit("10 per minute")
def signup():
    data = request.get_json() or {}
    sanitize_dict(data, ['name','email'])
    name  = str(data.get('name','')).strip()
    email = str(data.get('email','')).strip().lower()
    pw    = str(data.get('password',''))
    errors = {}
    if not name: errors['name'] = 'Name is required'
    elif len(name) < 2: errors['name'] = 'At least 2 characters'
    if not email: errors['email'] = 'Email is required'
    elif not is_valid_email(email): errors['email'] = 'Invalid email'
    if not pw: errors['password'] = 'Password is required'
    elif len(pw) < 6: errors['password'] = 'At least 6 characters'
    if errors: return jsonify({'error':'Validation failed','fields':errors}),400
    conn = get_db()
    try:
        c = conn.cursor()
        c.execute(f"INSERT INTO Users(name,email,password_hash)VALUES({ph(3)})",(name,email,generate_password_hash(pw)))
        conn.commit()
        logger.info(f'New user registered: {email}')
        return jsonify({'message':'Account created successfully'}),201
    except Exception as e:
        if 'unique' in str(e).lower() or 'duplicate' in str(e).lower():
            return jsonify({'error':'Email already registered'}),409
        return jsonify({'error':'Server error'}),500
    finally: conn.close()

@app.route('/api/auth/login', methods=['POST'])
@limiter.limit("5 per minute")
def login():
    data  = request.get_json() or {}
    email = str(data.get('email','')).strip().lower()
    pw    = str(data.get('password',''))
    if not email or not pw: return jsonify({'error':'Email and password required'}),400
    if not is_valid_email(email): return jsonify({'error':'Invalid email'}),400
    conn = get_db()
    try:
        c = conn.cursor()
        c.execute(f"SELECT * FROM Users WHERE email={PH}",(email,))
        user = fetchone(c)
    finally: conn.close()
    if not user or not check_password_hash(user['password_hash'], pw):
        logger.warning(f'Failed login attempt for email: {email}')
        return jsonify({'error':'Invalid email or password'}),401
    access, refresh = make_tokens(user)
    return jsonify({'token':access,'refresh_token':refresh,
                    'name':user['name'],'user_id':user['user_id'],'role':user['role']})

@app.route('/api/auth/refresh', methods=['POST'])
def refresh_token():
    data  = request.get_json() or {}
    token = data.get('refresh_token','')
    if not token: return jsonify({'error':'Refresh token required'}),400
    try:
        payload = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
        if payload.get('type') != 'refresh': return jsonify({'error':'Invalid token type'}),401
    except jwt.ExpiredSignatureError:
        return jsonify({'error':'Refresh token expired, please login again'}),401
    except jwt.InvalidTokenError:
        return jsonify({'error':'Invalid refresh token'}),401
    conn = get_db()
    try:
        c = conn.cursor()
        c.execute(f"SELECT * FROM Users WHERE user_id={PH}",(payload['user_id'],))
        user = fetchone(c)
    finally: conn.close()
    if not user: return jsonify({'error':'User not found'}),404
    access, _ = make_tokens(user)
    return jsonify({'token':access})


# ─── OEM ROUTES ──────────────────────────────────────────────────────────────
@app.route('/api/oem/count', methods=['GET'])
def oem_count():
    conn = get_db(); c = conn.cursor()
    try:
        total = scalar(c, "SELECT COUNT(*) FROM OEM_Specs")
        makes = scalar(c, "SELECT COUNT(DISTINCT make) FROM OEM_Specs")
        return jsonify({'total_entries':total,'total_makes':makes,
            'message':f'{total} OEM entries across {makes} manufacturers'})
    finally: conn.close()

@app.route('/api/oem/all', methods=['GET'])
def oem_all():
    cached = cache_get('oem:all')
    if cached is not None:
        return jsonify(cached)
    conn = get_db(); c = conn.cursor()
    try:
        c.execute("SELECT * FROM OEM_Specs ORDER BY make,model,year")
        result = [{**r,'available_colors':r['available_colors'].split(',')} for r in fetchall(c)]
        cache_set('oem:all', result, CACHE_TTL_OEM)
        return jsonify(result)
    finally: conn.close()

@app.route('/api/oem/search', methods=['GET'])
def oem_search():
    make=sanitize(request.args.get('make','')); model=sanitize(request.args.get('model',''))
    year=request.args.get('year',''); fuel=sanitize(request.args.get('fuel_type',''))
    transmission=sanitize(request.args.get('transmission',''))
    q="SELECT * FROM OEM_Specs WHERE 1=1"; params=[]
    if make: q+=f" AND LOWER(make) LIKE {PH}"; params.append(f'%{make.lower()}%')
    if model: q+=f" AND LOWER(model) LIKE {PH}"; params.append(f'%{model.lower()}%')
    if fuel: q+=f" AND LOWER(fuel_type) LIKE {PH}"; params.append(f'%{fuel.lower()}%')
    if transmission: q+=f" AND LOWER(transmission) LIKE {PH}"; params.append(f'%{transmission.lower()}%')
    if year:
        try: q+=f" AND year={PH}"; params.append(int(year))
        except ValueError: return jsonify({'error':'Year must be a number'}),400
    q+=" ORDER BY make,model,year"
    conn=get_db(); c=conn.cursor()
    try:
        c.execute(q,params)
        results=[{**r,'available_colors':r['available_colors'].split(',')} for r in fetchall(c)]
        return jsonify({'results':results,'count':len(results)})
    finally: conn.close()


# ─── INVENTORY ROUTES ────────────────────────────────────────────────────────
@app.route('/api/inventory', methods=['GET'])
def get_inventory():
    try:
        min_p=request.args.get('min_price',0,type=float); max_p=request.args.get('max_price',99999999,type=float)
        max_km=request.args.get('max_km',9999999,type=int); page=max(1,request.args.get('page',1,type=int))
        limit=min(50,max(1,request.args.get('limit',12,type=int))); offset=(page-1)*limit
        sort=request.args.get('sort','newest')
    except ValueError: return jsonify({'error':'Invalid filter parameters'}),400

    color=sanitize(request.args.get('color','')); dealer_id=request.args.get('dealer_id','')
    fuel_type=sanitize(request.args.get('fuel_type','')); transmission=sanitize(request.args.get('transmission',''))
    year=request.args.get('year',''); search=sanitize(request.args.get('search',''))

    # Build a deterministic cache key from all query params
    cache_key = f"inv:{min_p}:{max_p}:{max_km}:{page}:{limit}:{sort}:{color}:{dealer_id}:{fuel_type}:{transmission}:{year}:{search}"
    cached = cache_get(cache_key)
    if cached is not None:
        return jsonify(cached)

    sort_map={'newest':'i.listed_at DESC','price_asc':'i.asking_price ASC',
              'price_desc':'i.asking_price DESC','mileage':'o.mileage_kmpl DESC'}
    order=sort_map.get(sort,'i.listed_at DESC')

    base=f"""FROM Marketplace_Inventory i JOIN OEM_Specs o ON i.oem_id=o.oem_id
        JOIN Users u ON i.dealer_id=u.user_id
        WHERE i.asking_price BETWEEN {PH} AND {PH} AND i.odometer_km<={PH}"""
    params=[min_p,max_p,max_km]
    if color: base+=f" AND LOWER(i.color) LIKE {PH}"; params.append(f'%{color.lower()}%')
    if dealer_id: base+=f" AND i.dealer_id={PH}"; params.append(int(dealer_id))
    if fuel_type: base+=f" AND LOWER(o.fuel_type) LIKE {PH}"; params.append(f'%{fuel_type.lower()}%')
    if transmission: base+=f" AND LOWER(o.transmission) LIKE {PH}"; params.append(f'%{transmission.lower()}%')
    if year:
        try: base+=f" AND o.year={PH}"; params.append(int(year))
        except ValueError: return jsonify({'error':'Year must be a number'}),400
    if search:
        base+=f" AND (LOWER(i.title) LIKE {PH} OR LOWER(o.make) LIKE {PH} OR LOWER(o.model) LIKE {PH})"
        s=f'%{search.lower()}%'; params+=[s,s,s]

    conn=get_db(); c=conn.cursor()
    try:
        total=scalar(c,f"SELECT COUNT(*) {base}",params)
        c.execute(f"""SELECT i.*,o.make,o.model,o.year,o.mileage_kmpl,o.power_bhp,
            o.fuel_type,o.transmission,o.max_speed_kmph,u.name AS dealer_name {base}
            ORDER BY {order} LIMIT {PH} OFFSET {PH}""",params+[limit,offset])
        results=[{**r,'description':r['description'].split('|')} for r in fetchall(c)]
        payload = {'results':results,'count':len(results),'total':total,
            'page':page,'limit':limit,'total_pages':max(1,-(-total//limit))}
        cache_set(cache_key, payload, CACHE_TTL_SEARCH)
        return jsonify(payload)
    finally: conn.close()

@app.route('/api/inventory', methods=['POST'])
@token_required
def add_inventory():
    data=request.get_json() or {}
    sanitize_dict(data,['title','color','registration_place','image_url'])
    errors=validate_inventory(data)
    if errors: return jsonify({'error':'Validation failed','fields':errors}),400
    conn=get_db(); c=conn.cursor()
    try:
        c.execute(f"SELECT oem_id FROM OEM_Specs WHERE oem_id={PH}",(data['oem_id'],))
        if not fetchone(c): return jsonify({'error':'Invalid OEM model'}),400
        desc='|'.join(data['description']) if isinstance(data['description'],list) else str(data['description'])
        c.execute(f"""INSERT INTO Marketplace_Inventory(dealer_id,oem_id,title,description,asking_price,
            color,odometer_km,major_scratches,original_paint,accidents_reported,previous_buyers,
            registration_place,image_url)VALUES({ph(13)})""",
            (request.user_id,data['oem_id'],data['title'].strip(),desc,float(data['asking_price']),
             data['color'].strip(),int(data['odometer_km']),max(0,int(data.get('major_scratches',0))),
             True if data.get('original_paint',1) else False,max(0,int(data.get('accidents_reported',0))),
             max(0,int(data.get('previous_buyers',0))),data['registration_place'].strip(),data.get('image_url','')))
        conn.commit()
        cache_delete_pattern('inv:*')
        cache_delete_pattern('stats:*')
        c.execute("SELECT lastval()" if DB_TYPE=='postgres' else "SELECT last_insert_rowid()")
        new_id=c.fetchone(); new_id=list(new_id.values())[0] if isinstance(new_id,dict) else new_id[0]
        return jsonify({'message':'Listing added successfully','inventory_id':new_id}),201
    except Exception: return jsonify({'error':'Failed to add listing'}),500
    finally: conn.close()

@app.route('/api/inventory/<int:inv_id>', methods=['PUT'])
@token_required
def update_inventory(inv_id):
    data=request.get_json() or {}
    sanitize_dict(data,['title','color','registration_place','image_url'])
    conn=get_db(); c=conn.cursor()
    try:
        if request.user_role=='admin':
            c.execute(f"SELECT * FROM Marketplace_Inventory WHERE inventory_id={PH}",(inv_id,))
        else:
            c.execute(f"SELECT * FROM Marketplace_Inventory WHERE inventory_id={PH} AND dealer_id={PH}",(inv_id,request.user_id))
        item=fetchone(c)
        if not item: return jsonify({'error':'Listing not found or unauthorized'}),404
        desc=('|'.join(data['description']) if isinstance(data.get('description'),list)
              else data.get('description',item['description']))
        c.execute(f"""UPDATE Marketplace_Inventory SET title={PH},description={PH},asking_price={PH},
            color={PH},odometer_km={PH},major_scratches={PH},original_paint={PH},
            accidents_reported={PH},previous_buyers={PH},registration_place={PH},image_url={PH}
            WHERE inventory_id={PH}""",
            (data.get('title',item['title']),desc,data.get('asking_price',item['asking_price']),
             data.get('color',item['color']),data.get('odometer_km',item['odometer_km']),
             max(0,int(data.get('major_scratches',item['major_scratches']))),
             True if data.get('original_paint',item['original_paint']) else False,
             max(0,int(data.get('accidents_reported',item['accidents_reported']))),
             max(0,int(data.get('previous_buyers',item['previous_buyers']))),
             data.get('registration_place',item['registration_place']),
             data.get('image_url',item['image_url']) or '',inv_id))
        conn.commit()
        cache_delete_pattern('inv:*')
        cache_delete_pattern('stats:*')
        return jsonify({'message':'Listing updated successfully'})
    except Exception: return jsonify({'error':'Failed to update listing'}),500
    finally: conn.close()

@app.route('/api/inventory/<int:inv_id>', methods=['DELETE'])
@token_required
def delete_inventory(inv_id):
    conn=get_db(); c=conn.cursor()
    try:
        if request.user_role=='admin':
            c.execute(f"DELETE FROM Marketplace_Inventory WHERE inventory_id={PH}",(inv_id,))
        else:
            c.execute(f"DELETE FROM Marketplace_Inventory WHERE inventory_id={PH} AND dealer_id={PH}",(inv_id,request.user_id))
        conn.commit()
        if c.rowcount==0: return jsonify({'error':'Not found or unauthorized'}),404
        cache_delete_pattern('inv:*')
        cache_delete_pattern('stats:*')
        return jsonify({'message':'Listing deleted successfully'})
    finally: conn.close()

@app.route('/api/inventory/bulk-delete', methods=['POST'])
@token_required
def bulk_delete():
    data=request.get_json(force=True) or {}; ids=data.get('ids',[])
    if not ids: return jsonify({'error':'No listing IDs provided'}),400
    if not isinstance(ids,list) or not all(isinstance(i,int) for i in ids):
        return jsonify({'error':'IDs must be a list of integers'}),400
    if len(ids)>100: return jsonify({'error':'Max 100 at once'}),400
    placeholders=','.join([PH]*len(ids))
    conn=get_db(); c=conn.cursor()
    try:
        if request.user_role=='admin':
            c.execute(f"DELETE FROM Marketplace_Inventory WHERE inventory_id IN ({placeholders})",ids)
        else:
            c.execute(f"DELETE FROM Marketplace_Inventory WHERE inventory_id IN ({placeholders}) AND dealer_id={PH}",ids+[request.user_id])
        conn.commit()
        cache_delete_pattern('inv:*')
        cache_delete_pattern('stats:*')
        return jsonify({'message':f'Deleted {c.rowcount} listing(s)'})
    finally: conn.close()


# ─── ADMIN ROUTES ─────────────────────────────────────────────────────────────
@app.route('/api/admin/listings', methods=['GET'])
@admin_required
def admin_all_listings():
    page=max(1,request.args.get('page',1,type=int)); limit=min(50,max(1,request.args.get('limit',20,type=int)))
    offset=(page-1)*limit; conn=get_db(); c=conn.cursor()
    try:
        total=scalar(c,"SELECT COUNT(*) FROM Marketplace_Inventory")
        c.execute(f"""SELECT i.*,o.make,o.model,o.year,o.fuel_type,o.transmission,u.name AS dealer_name
            FROM Marketplace_Inventory i JOIN OEM_Specs o ON i.oem_id=o.oem_id
            JOIN Users u ON i.dealer_id=u.user_id ORDER BY i.listed_at DESC LIMIT {PH} OFFSET {PH}""",(limit,offset))
        results=[{**r,'description':r['description'].split('|')} for r in fetchall(c)]
        return jsonify({'results':results,'total':total,'page':page,'limit':limit,'total_pages':max(1,-(-total//limit))})
    finally: conn.close()

@app.route('/api/admin/stats', methods=['GET'])
@admin_required
def admin_stats():
    conn=get_db(); c=conn.cursor()
    try:
        tl=scalar(c,"SELECT COUNT(*) FROM Marketplace_Inventory")
        td=scalar(c,"SELECT COUNT(*) FROM Users WHERE role='dealer'")
        ap=scalar(c,"SELECT AVG(asking_price) FROM Marketplace_Inventory")
        to=scalar(c,"SELECT COUNT(*) FROM OEM_Specs")
        c.execute("""SELECT u.name,COUNT(i.inventory_id) as listing_count,AVG(i.asking_price) as avg_price
            FROM Users u LEFT JOIN Marketplace_Inventory i ON u.user_id=i.dealer_id
            WHERE u.role='dealer' GROUP BY u.user_id,u.name ORDER BY listing_count DESC""")
        return jsonify({'total_listings':tl,'total_dealers':td,'avg_price':round(ap or 0,2),
                        'total_oems':to,'dealer_stats':fetchall(c)})
    finally: conn.close()


# ─── PUBLIC STATS ─────────────────────────────────────────────────────────────
@app.route('/api/stats', methods=['GET'])
def public_stats():
    cached = cache_get('stats:public')
    if cached is not None:
        return jsonify(cached)
    conn=get_db(); c=conn.cursor()
    try:
        total=scalar(c,"SELECT COUNT(*) FROM Marketplace_Inventory")
        avg_p=scalar(c,"SELECT AVG(asking_price) FROM Marketplace_Inventory")
        dealers=scalar(c,"SELECT COUNT(DISTINCT dealer_id) FROM Marketplace_Inventory")
        c.execute("""SELECT o.fuel_type,COUNT(*) as count FROM Marketplace_Inventory i
            JOIN OEM_Specs o ON i.oem_id=o.oem_id GROUP BY o.fuel_type""")
        by_fuel=fetchall(c)
        c.execute("""SELECT o.make,COUNT(*) as count FROM Marketplace_Inventory i
            JOIN OEM_Specs o ON i.oem_id=o.oem_id GROUP BY o.make ORDER BY count DESC LIMIT 5""")
        result = {'total_listings':total,'avg_price':round(avg_p or 0,2),
            'active_dealers':dealers,'by_fuel':by_fuel,'top_makes':fetchall(c)}
        cache_set('stats:public', result, CACHE_TTL_STATS)
        return jsonify(result)
    finally: conn.close()


# ─── HEALTH ───────────────────────────────────────────────────────────────────
@app.route('/api/health', methods=['GET'])
def health():
    r = get_redis()
    cache_status = 'connected' if r else ('disabled' if not REDIS_URL else 'unreachable')
    return jsonify({'status':'ok','db':DB_TYPE,'cache':cache_status})

@app.route('/api/cache/stats', methods=['GET'])
@admin_required
def cache_stats():
    """Admin endpoint — returns Redis memory/key stats if available."""
    r = get_redis()
    if not r:
        return jsonify({'cache':'disabled','reason':'REDIS_URL not set or Redis unreachable'})
    try:
        info = r.info('memory')
        keyspace = r.info('keyspace')
        return jsonify({
            'cache': 'connected',
            'used_memory_human': info.get('used_memory_human'),
            'total_keys': sum(v.get('keys',0) for v in keyspace.values()) if keyspace else 0,
            'keyspace': keyspace,
        })
    except Exception as e:
        return jsonify({'cache':'error','detail':str(e)}), 500



# ─── WISHLIST ROUTES ──────────────────────────────────────────────────────────
@app.route('/api/wishlist', methods=['GET'])
@token_required
def get_wishlist():
    conn = get_db(); c = conn.cursor()
    try:
        if DB_TYPE == 'postgres':
            c.execute("""CREATE TABLE IF NOT EXISTS Wishlist (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES Users(user_id),
                inventory_id INTEGER NOT NULL REFERENCES Marketplace_Inventory(inventory_id),
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, inventory_id))""")
        else:
            c.execute("""CREATE TABLE IF NOT EXISTS Wishlist (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES Users(user_id),
                inventory_id INTEGER NOT NULL REFERENCES Marketplace_Inventory(inventory_id),
                added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, inventory_id))""")
        conn.commit()
        c.execute(f"""SELECT i.*,o.make,o.model,o.year,o.mileage_kmpl,o.power_bhp,
            o.fuel_type,o.transmission,o.max_speed_kmph,u.name AS dealer_name,w.added_at AS wishlisted_at
            FROM Wishlist w
            JOIN Marketplace_Inventory i ON w.inventory_id=i.inventory_id
            JOIN OEM_Specs o ON i.oem_id=o.oem_id
            JOIN Users u ON i.dealer_id=u.user_id
            WHERE w.user_id={PH} ORDER BY w.added_at DESC""", (request.user_id,))
        results = [{**r, 'description': r['description'].split('|')} for r in fetchall(c)]
        return jsonify({'results': results, 'count': len(results)})
    finally:
        conn.close()

@app.route('/api/wishlist/<int:inv_id>', methods=['POST'])
@token_required
def add_to_wishlist(inv_id):
    conn = get_db(); c = conn.cursor()
    try:
        # Ensure table exists
        if DB_TYPE == 'postgres':
            c.execute("""CREATE TABLE IF NOT EXISTS Wishlist (
                id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES Users(user_id),
                inventory_id INTEGER NOT NULL REFERENCES Marketplace_Inventory(inventory_id),
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, inventory_id))""")
        else:
            c.execute("""CREATE TABLE IF NOT EXISTS Wishlist (
                id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
                inventory_id INTEGER NOT NULL, added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, inventory_id))""")
        # Check listing exists
        c.execute(f"SELECT inventory_id FROM Marketplace_Inventory WHERE inventory_id={PH}", (inv_id,))
        if not fetchone(c):
            return jsonify({'error': 'Listing not found'}), 404
        try:
            c.execute(f"INSERT INTO Wishlist(user_id,inventory_id)VALUES({ph(2)})", (request.user_id, inv_id))
            conn.commit()
            logger.info(f"User {request.user_id} added car {inv_id} to wishlist")
            return jsonify({'message': 'Added to wishlist ❤️', 'wishlisted': True}), 201
        except Exception as e:
            if 'unique' in str(e).lower():
                return jsonify({'error': 'Already in wishlist', 'wishlisted': True}), 409
            raise
    finally:
        conn.close()

@app.route('/api/wishlist/<int:inv_id>', methods=['DELETE'])
@token_required
def remove_from_wishlist(inv_id):
    conn = get_db(); c = conn.cursor()
    try:
        c.execute(f"DELETE FROM Wishlist WHERE user_id={PH} AND inventory_id={PH}",
                  (request.user_id, inv_id))
        conn.commit()
        if c.rowcount == 0:
            return jsonify({'error': 'Not in wishlist'}), 404
        return jsonify({'message': 'Removed from wishlist', 'wishlisted': False})
    finally:
        conn.close()

@app.route('/api/wishlist/ids', methods=['GET'])
@token_required
def get_wishlist_ids():
    """Returns just the list of wishlisted inventory IDs — fast check for heart icons."""
    conn = get_db(); c = conn.cursor()
    try:
        c.execute(f"SELECT inventory_id FROM Wishlist WHERE user_id={PH}", (request.user_id,))
        ids = [list(r.values())[0] if isinstance(r, dict) else r[0] for r in c.fetchall()]
        return jsonify({'ids': ids})
    except Exception:
        return jsonify({'ids': []})
    finally:
        conn.close()

# ─── ERROR HANDLERS ───────────────────────────────────────────────────────────
@app.errorhandler(404)
def not_found(e): return jsonify({'error':'Endpoint not found'}),404
@app.errorhandler(405)
def method_not_allowed(e): return jsonify({'error':'Method not allowed'}),405
@app.errorhandler(429)
def ratelimit(e): return jsonify({'error':'Too many requests, please slow down'}),429
@app.errorhandler(500)
def server_error(e):
    logger.error(f"500 Internal Server Error: {e}", exc_info=True)
    return jsonify({'error':'Internal server error'}),500


# ─── ENTRY POINT ──────────────────────────────────────────────────────────────
if __name__ == '__main__':
    init_db()
    port  = int(os.getenv('PORT', 5000))
    debug = AppConfig.DEBUG
    print(f"buycars.com backend  •  DB: {DB_TYPE}  •  http://0.0.0.0:{port}")
    app.run(debug=debug, host='0.0.0.0', port=port)
