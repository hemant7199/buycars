-- ============================================================
--  buycars.com (BUYC Corp) – Database Schema & Dummy Data
--  Phase II: Table Design for Junior Engineering Team
-- ============================================================

-- ─── TABLE 1: Users (Dealers & Admins) ──────────────────────
CREATE TABLE IF NOT EXISTS Users (
    user_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    email         TEXT    UNIQUE NOT NULL,
    password_hash TEXT    NOT NULL,
    role          TEXT    DEFAULT 'dealer' CHECK(role IN ('dealer','admin')),
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── TABLE 2: OEM_Specs ──────────────────────────────────────
-- Stores manufacturer specifications for all car models.
-- Dealers reference this table when listing inventory.
CREATE TABLE IF NOT EXISTS OEM_Specs (
    oem_id           INTEGER PRIMARY KEY AUTOINCREMENT,
    make             TEXT    NOT NULL,               -- e.g. Honda, Maruti, BMW
    model            TEXT    NOT NULL,               -- e.g. City, Swift, 3 Series
    year             INTEGER NOT NULL,               -- Year of manufacture/model
    list_price       REAL    NOT NULL,               -- MRP of new vehicle (INR)
    available_colors TEXT    NOT NULL,               -- Comma-separated color names
    mileage_kmpl     REAL    NOT NULL,               -- ARAI-certified mileage
    power_bhp        REAL    NOT NULL,               -- Engine power in BHP
    max_speed_kmph   INTEGER NOT NULL,               -- Top speed in km/h
    fuel_type        TEXT    NOT NULL CHECK(fuel_type IN ('Petrol','Diesel','Electric','CNG','Hybrid')),
    transmission     TEXT    NOT NULL CHECK(transmission IN ('Manual','Automatic','CVT','AMT','DCT')),
    UNIQUE(make, model, year)
);

-- ─── TABLE 3: Marketplace_Inventory ──────────────────────────
-- Dealer-listed second-hand vehicles on the marketplace.
CREATE TABLE IF NOT EXISTS Marketplace_Inventory (
    inventory_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    dealer_id          INTEGER NOT NULL REFERENCES Users(user_id),
    oem_id             INTEGER NOT NULL REFERENCES OEM_Specs(oem_id),
    title              TEXT    NOT NULL,             -- Listing headline
    description        TEXT    NOT NULL,             -- Pipe-separated bullet points (max 5)
    asking_price       REAL    NOT NULL,             -- Dealer's asking price (INR)
    color              TEXT    NOT NULL,             -- Actual color of the vehicle
    odometer_km        INTEGER NOT NULL,             -- KMs on odometer
    major_scratches    INTEGER DEFAULT 0,            -- Count of major scratches
    original_paint     BOOLEAN DEFAULT 1,            -- TRUE = original factory paint
    accidents_reported INTEGER DEFAULT 0,            -- Number of reported accidents
    previous_buyers    INTEGER DEFAULT 0,            -- Number of previous owners
    registration_place TEXT    NOT NULL,             -- RTO registration city
    image_url          TEXT,                         -- URL to car image
    listed_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── INDEXES for performance ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_oem_make_model  ON OEM_Specs(make, model, year);
CREATE INDEX IF NOT EXISTS idx_inv_dealer      ON Marketplace_Inventory(dealer_id);
CREATE INDEX IF NOT EXISTS idx_inv_price       ON Marketplace_Inventory(asking_price);
CREATE INDEX IF NOT EXISTS idx_inv_oem         ON Marketplace_Inventory(oem_id);

-- ============================================================
--  DUMMY DATA
-- ============================================================

-- Users (password: password123)
INSERT INTO Users (name, email, password_hash, role) VALUES
('Rajesh Kumar',  'rajesh@dealer.com', 'ef92b778bafe771207fbe1bc29c5f37e3e0a09baaa42c7dadd9d7a64f89b26f9', 'dealer'),
('Sunita Sharma', 'sunita@dealer.com', 'ef92b778bafe771207fbe1bc29c5f37e3e0a09baaa42c7dadd9d7a64f89b26f9', 'dealer'),
('Amit Verma',    'amit@dealer.com',   'ef92b778bafe771207fbe1bc29c5f37e3e0a09baaa42c7dadd9d7a64f89b26f9', 'dealer');

-- OEM Specs (12 entries across 7 manufacturers)
INSERT INTO OEM_Specs (make, model, year, list_price, available_colors, mileage_kmpl, power_bhp, max_speed_kmph, fuel_type, transmission) VALUES
('Honda',      'City',      2015, 1050000, 'White,Silver,Red,Blue',                         17.8, 118.0, 180, 'Petrol', 'Manual'),
('Honda',      'City',      2018, 1150000, 'White,Silver,Red,Blue,Grey',                    17.8, 118.0, 180, 'Petrol', 'CVT'),
('Honda',      'City',      2021, 1195000, 'Platinum White,Golden Brown,Lunar Silver',      18.4, 119.0, 180, 'Petrol', 'CVT'),
('Maruti',     'Swift',     2016,  560000, 'Lucent Orange,Pearl Red,Autumn Orange Grey',    22.0,  83.1, 160, 'Petrol', 'Manual'),
('Maruti',     'Swift',     2020,  625000, 'Solid Fire Red,Pearl Metallic White,Midnight Black', 23.2, 89.0, 170, 'Petrol', 'AMT'),
('Hyundai',    'Creta',     2019, 1200000, 'Phantom Black,Polar White,Typhoon Silver',      17.0, 113.4, 180, 'Petrol', 'Manual'),
('Hyundai',    'Creta',     2022, 1425000, 'Abyss Black,Atlas White,Titan Grey',            14.4, 113.4, 185, 'Petrol', 'DCT'),
('Toyota',     'Innova',    2017, 1800000, 'White Pearl,Silver Metallic,Bronze Mica',       11.0, 148.0, 170, 'Diesel', 'Manual'),
('BMW',        '3 Series',  2019, 4200000, 'Alpine White,Black Sapphire,Glacier Silver',   15.2, 190.0, 250, 'Petrol', 'Automatic'),
('Tata',       'Nexon',     2021,  850000, 'Flame Red,Calgary White,Daytona Grey',          17.0, 120.0, 180, 'Petrol', 'AMT'),
('Mahindra',   'XUV500',    2018, 1550000, 'Pearl White,Midnight Black,Crimson Red',        15.1, 140.0, 185, 'Diesel', 'Manual'),
('Volkswagen', 'Polo',      2017,  720000, 'Candy White,Deep Black,Reflex Silver',          18.7, 104.5, 185, 'Petrol', 'Manual');

-- Marketplace Inventory (6 listings)
INSERT INTO Marketplace_Inventory
(dealer_id, oem_id, title, description, asking_price, color, odometer_km, major_scratches, original_paint, accidents_reported, previous_buyers, registration_place, image_url)
VALUES
(1, 1, 'Honda City 2015 – Single Owner, Well Maintained',
 'Pristine condition|Recently serviced|All original parts|Accident-free history|Full insurance valid',
 620000, 'White', 52000, 0, 1, 0, 1, 'Delhi', 'https://imgd.aeplcdn.com/664x374/n/cw/ec/41564/city-exterior-right-front-three-quarter-3.jpeg'),

(1, 4, 'Maruti Swift 2016 – Great Mileage, Low Price',
 'CNG kit factory fitted|Dual airbags|Power steering|Central locking|Music system',
 310000, 'Red', 78000, 1, 1, 0, 2, 'Patiala', NULL),

(2, 6, 'Hyundai Creta 2019 – Sunroof, Low KMs',
 'Sunroof installed|Apple CarPlay & Android Auto|Reverse camera|Wireless charging|Lane assist',
 850000, 'Phantom Black', 34000, 0, 1, 1, 1, 'Chandigarh', NULL),

(2, 8, 'Toyota Innova 2017 – 7 Seater, Family Use',
 '7-seater family SUV|Captain seats in second row|Dual zone AC|Cruise control|18-inch alloys',
 1150000, 'Silver', 65000, 0, 1, 0, 2, 'Mumbai', NULL),

(3, 10, 'Tata Nexon 2021 – 5 Star Safety, Like New',
 '5-star Global NCAP safety|Electric sunroof|JBL sound system|Terrain modes|Harman infotainment',
 730000, 'Flame Red', 18000, 0, 1, 0, 1, 'Bangalore', NULL),

(3, 2, 'Honda City 2018 CVT – Automatic, Excellent Condition',
 'CVT Automatic transmission|Sensing safety suite|LED headlights|8-inch touchscreen|Leather seats',
 780000, 'Silver', 41000, 0, 1, 0, 1, 'Hyderabad', NULL);
