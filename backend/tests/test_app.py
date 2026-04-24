"""
pytest test suite for buycars.com backend
Run: cd buycars_improved/backend && pytest tests/ -v
"""
import pytest
import json
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ['SECRET_KEY'] = 'test_secret_key_123'
os.environ['TESTING'] = '1'
import app as flask_app

@pytest.fixture
def client(tmp_path):
    test_db = str(tmp_path / "test.db")
    flask_app.DB_PATH = test_db
    flask_app.app.config['TESTING'] = True
    flask_app.app.config['SECRET_KEY'] = 'test_secret_key_123'
    flask_app.init_db()
    with flask_app.app.test_client() as client:
        yield client

def get_token(client, email='rajesh@dealer.com', password='password123'):
    r = client.post('/api/auth/login',
        data=json.dumps({'email': email, 'password': password}),
        content_type='application/json')
    return json.loads(r.data)

class TestSignup:
    def test_signup_success(self, client):
        r = client.post('/api/auth/signup',
            data=json.dumps({'name':'Test User','email':'test@example.com','password':'pass123'}),
            content_type='application/json')
        assert r.status_code == 201

    def test_signup_duplicate_email(self, client):
        data = {'name':'Dup','email':'rajesh@dealer.com','password':'pass123'}
        r = client.post('/api/auth/signup', data=json.dumps(data), content_type='application/json')
        assert r.status_code == 409

    def test_signup_missing_fields(self, client):
        r = client.post('/api/auth/signup',
            data=json.dumps({'email':'x@x.com'}), content_type='application/json')
        assert r.status_code == 400

    def test_signup_invalid_email(self, client):
        r = client.post('/api/auth/signup',
            data=json.dumps({'name':'Test','email':'not-an-email','password':'pass123'}),
            content_type='application/json')
        assert r.status_code == 400

    def test_signup_short_password(self, client):
        r = client.post('/api/auth/signup',
            data=json.dumps({'name':'Test','email':'new@example.com','password':'abc'}),
            content_type='application/json')
        assert r.status_code == 400

class TestLogin:
    def test_login_success(self, client):
        r = client.post('/api/auth/login',
            data=json.dumps({'email':'rajesh@dealer.com','password':'password123'}),
            content_type='application/json')
        assert r.status_code == 200
        data = json.loads(r.data)
        assert 'token' in data
        assert data['name'] == 'Rajesh Kumar'

    def test_login_wrong_password(self, client):
        r = client.post('/api/auth/login',
            data=json.dumps({'email':'rajesh@dealer.com','password':'wrongpass'}),
            content_type='application/json')
        assert r.status_code == 401

    def test_login_unknown_email(self, client):
        r = client.post('/api/auth/login',
            data=json.dumps({'email':'nobody@example.com','password':'pass123'}),
            content_type='application/json')
        assert r.status_code == 401

    def test_login_missing_fields(self, client):
        r = client.post('/api/auth/login', data=json.dumps({}), content_type='application/json')
        assert r.status_code == 400

    def test_login_returns_role(self, client):
        data = get_token(client)
        assert 'role' in data
        assert data['role'] == 'dealer'

class TestOEM:
    def test_oem_count(self, client):
        r = client.get('/api/oem/count')
        assert r.status_code == 200
        data = json.loads(r.data)
        assert data['total_entries'] == 12

    def test_oem_all(self, client):
        r = client.get('/api/oem/all')
        data = json.loads(r.data)
        assert len(data) == 12

    def test_oem_search_by_make(self, client):
        r = client.get('/api/oem/search?make=Honda')
        data = json.loads(r.data)
        assert data['count'] == 3
        assert all(o['make'] == 'Honda' for o in data['results'])

    def test_oem_search_by_fuel(self, client):
        r = client.get('/api/oem/search?fuel_type=Diesel')
        data = json.loads(r.data)
        assert all(o['fuel_type'] == 'Diesel' for o in data['results'])

    def test_oem_search_invalid_year(self, client):
        r = client.get('/api/oem/search?year=notayear')
        assert r.status_code == 400

    def test_oem_colors_is_list(self, client):
        r = client.get('/api/oem/all')
        data = json.loads(r.data)
        assert isinstance(data[0]['available_colors'], list)

class TestInventory:
    def test_get_all_inventory(self, client):
        r = client.get('/api/inventory')
        assert r.status_code == 200
        data = json.loads(r.data)
        assert data['total'] == 6
        assert 'page' in data
        assert 'total_pages' in data

    def test_pagination(self, client):
        r = client.get('/api/inventory?page=1&limit=2')
        data = json.loads(r.data)
        assert len(data['results']) == 2
        assert data['total_pages'] == 3

    def test_filter_by_price(self, client):
        r = client.get('/api/inventory?max_price=400000')
        data = json.loads(r.data)
        assert all(c['asking_price'] <= 400000 for c in data['results'])

    def test_filter_by_fuel_type(self, client):
        r = client.get('/api/inventory?fuel_type=Diesel')
        data = json.loads(r.data)
        assert all(c['fuel_type'] == 'Diesel' for c in data['results'])

    def test_filter_by_year(self, client):
        r = client.get('/api/inventory?year=2021')
        data = json.loads(r.data)
        assert all(c['year'] == 2021 for c in data['results'])

    def test_add_listing_requires_auth(self, client):
        r = client.post('/api/inventory',
            data=json.dumps({'title':'Test','asking_price':500000}),
            content_type='application/json')
        assert r.status_code == 401

    def test_add_listing_success(self, client):
        token = get_token(client)['token']
        payload = {'oem_id':1,'title':'Test Honda City','asking_price':550000,
            'color':'White','odometer_km':40000,'registration_place':'Delhi',
            'description':['Good condition','Low km']}
        r = client.post('/api/inventory', data=json.dumps(payload),
            content_type='application/json',
            headers={'Authorization': f'Bearer {token}'})
        assert r.status_code == 201
        assert 'inventory_id' in json.loads(r.data)

    def test_add_listing_invalid_price(self, client):
        token = get_token(client)['token']
        payload = {'oem_id':1,'title':'Test Car','asking_price':-1000,
            'color':'Red','odometer_km':10000,'registration_place':'Delhi','description':['Good']}
        r = client.post('/api/inventory', data=json.dumps(payload),
            content_type='application/json',
            headers={'Authorization': f'Bearer {token}'})
        assert r.status_code == 400

    def test_add_listing_invalid_oem(self, client):
        token = get_token(client)['token']
        payload = {'oem_id':9999,'title':'Ghost Car','asking_price':500000,
            'color':'Blue','odometer_km':20000,'registration_place':'Mumbai','description':['Test']}
        r = client.post('/api/inventory', data=json.dumps(payload),
            content_type='application/json',
            headers={'Authorization': f'Bearer {token}'})
        assert r.status_code == 400

    def test_delete_own_listing(self, client):
        token = get_token(client)['token']
        r = client.delete('/api/inventory/1', headers={'Authorization': f'Bearer {token}'})
        assert r.status_code == 200

    def test_cannot_delete_other_dealers_listing(self, client):
        token = get_token(client)['token']
        r = client.delete('/api/inventory/3', headers={'Authorization': f'Bearer {token}'})
        assert r.status_code == 404

    def test_bulk_delete(self, client):
        token = get_token(client)['token']
        r = client.post('/api/inventory/bulk-delete',
            data=json.dumps({'ids':[1,2]}), content_type='application/json',
            headers={'Authorization': f'Bearer {token}'})
        assert r.status_code == 200
        assert '2' in json.loads(r.data)['message']

class TestAdmin:
    def test_admin_stats_requires_admin(self, client):
        token = get_token(client)['token']
        r = client.get('/api/admin/stats', headers={'Authorization': f'Bearer {token}'})
        assert r.status_code == 403

    def test_admin_stats_success(self, client):
        token = get_token(client, 'admin@buycars.com', 'admin123')['token']
        r = client.get('/api/admin/stats', headers={'Authorization': f'Bearer {token}'})
        assert r.status_code == 200
        data = json.loads(r.data)
        assert 'total_listings' in data

    def test_admin_can_delete_any_listing(self, client):
        token = get_token(client, 'admin@buycars.com', 'admin123')['token']
        r = client.delete('/api/inventory/3', headers={'Authorization': f'Bearer {token}'})
        assert r.status_code == 200

class TestPublicStats:
    def test_public_stats(self, client):
        r = client.get('/api/stats')
        assert r.status_code == 200
        data = json.loads(r.data)
        assert 'total_listings' in data
        assert 'avg_price' in data
        assert 'by_fuel' in data

class TestErrorHandlers:
    def test_404(self, client):
        r = client.get('/api/nonexistent')
        assert r.status_code == 404

    def test_no_token_returns_401(self, client):
        r = client.post('/api/inventory', data=json.dumps({}), content_type='application/json')
        assert r.status_code == 401

    def test_invalid_token_returns_401(self, client):
        r = client.get('/api/admin/stats', headers={'Authorization': 'Bearer faketoken'})
        assert r.status_code == 401


class TestRefreshToken:
    def test_refresh_success(self, client):
        r = client.post('/api/auth/login',
            data=json.dumps({'email': 'rajesh@dealer.com', 'password': 'password123'}),
            content_type='application/json')
        d = json.loads(r.data)
        assert 'refresh_token' in d, "Login should return refresh_token"
        r2 = client.post('/api/auth/refresh',
            data=json.dumps({'refresh_token': d['refresh_token']}),
            content_type='application/json')
        assert r2.status_code == 200
        d2 = json.loads(r2.data)
        assert 'token' in d2

    def test_refresh_missing_token(self, client):
        r = client.post('/api/auth/refresh',
            data=json.dumps({}), content_type='application/json')
        assert r.status_code == 400

    def test_refresh_invalid_token(self, client):
        r = client.post('/api/auth/refresh',
            data=json.dumps({'refresh_token': 'bad.token.here'}),
            content_type='application/json')
        assert r.status_code == 401


class TestSortAndSearch:
    def test_sort_price_asc(self, client):
        r = client.get('/api/inventory?sort=price_asc')
        assert r.status_code == 200
        d = json.loads(r.data)
        prices = [item['asking_price'] for item in d['results']]
        assert prices == sorted(prices)

    def test_sort_price_desc(self, client):
        r = client.get('/api/inventory?sort=price_desc')
        assert r.status_code == 200
        d = json.loads(r.data)
        prices = [item['asking_price'] for item in d['results']]
        assert prices == sorted(prices, reverse=True)

    def test_search_by_make(self, client):
        r = client.get('/api/inventory?search=honda')
        assert r.status_code == 200
        d = json.loads(r.data)
        for item in d['results']:
            assert 'honda' in item['make'].lower() or 'honda' in item['title'].lower()

    def test_health_endpoint(self, client):
        r = client.get('/api/health')
        assert r.status_code == 200
        d = json.loads(r.data)
        assert d['status'] == 'ok'
        assert 'db' in d
