import { Pool } from "pg";
import dotenv from "dotenv";
 
dotenv.config(); 
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL, 
  ssl: { rejectUnauthorized: false }, 
});


const createTables = async () => {
  const queries = [
    `CREATE TABLE IF NOT EXISTS polls (
  id SERIAL PRIMARY KEY,
  profile BYTEA,
  title TEXT NOT NULL,
  category TEXT,
  region TEXT,
  county TEXT,
  constituency TEXT,
  party TEXT,
  spoiled_votes INT DEFAULT 0,
  is_custom BOOLEAN DEFAULT FALSE,
  CHECK (
    is_custom = TRUE OR category IN (
      'Presidential', 'Governorship', 'Senatorial', 'Parliamentary', 'Women Representative'
    )
  ),

  CHECK (
    region IN ('Coast', 'Nairobi', 'Central', 'Eastern', 'North Eastern', 'Rift Valley', 'Western', 'Nyanza')),
  CHECK (
    county IN (
      'Mombasa', 'Kwale', 'Kilifi', 'Tana River', 'Lamu', 'Taita Taveta',
      'Garissa', 'Wajir', 'Mandera', 'Marsabit', 'Isiolo', 'Meru', 'Tharaka Nithi',
      'Embu', 'Kitui', 'Machakos', 'Makueni', 'Nyandarua', 'Nyeri', 'Kirinyaga',
      'Murang’a', 'Kiambu', 'Turkana', 'West Pokot', 'Samburu', 'Trans Nzoia',
      'Uasin Gishu', 'Elgeyo Marakwet', 'Nandi', 'Baringo', 'Laikipia', 'Nakuru',
      'Narok', 'Kajiado', 'Kericho', 'Bomet', 'Kakamega', 'Vihiga', 'Bungoma',
      'Busia', 'Siaya', 'Kisumu', 'Homa Bay', 'Migori', 'Kisii', 'Nyamira',
      'Nairobi'
    )
  ),
  CHECK (
    constituency IN ('Changamwe', 'Jomvu', 'Kisauni', 'Nyali', 'Likoni', 'Mvita',
      'Msambweni', 'Lunga Lunga', 'Matuga', 'Kinango',
      'Kilifi North', 'Kilifi South', 'Kaloleni', 'Rabai', 'Ganze', 'Malindi', 'Magarini',
      'Garsen', 'Galole', 'Bura','Lamu East', 'Lamu West',
      'Taveta', 'Wundanyi', 'Mwatate', 'Voi',
      'Garissa Township', 'Balambala', 'Lagdera', 'Dadaab', 'Fafi',
      'Wajir East', 'Tarbaj', 'Wajir West', 'Eldas', 'Wajir South',
      'Mandera West', 'Mandera North', 'Mandera South', 'Mandera East', 'Lafey',
      'Isiolo North', 'Isiolo South',
      'North Horr', 'Laisamis', 'Saku', 'Moyale', 'Tigania East', 'Tigania West', 'Igembe South', 'Igembe Central', 'Igembe North', 'Buuri', 'Imenti North', 'Imenti South', 'Imenti Central',
      'Chuka/Igambangombe', 'Maara', 'Tharaka',
      'Manyatta', 'Mbeere North', 'Runyenjes', 'Mbeere South',  'Kitui Central', 'Kitui West', 'Kitui East', 'Kitui Rural', 'Mwingi North', 'Mwingi Central', 'Mwingi West',
      'Mavoko', 'Yatta', 'Kangundo', 'Masinga', 'Matungulu', 'Kathiani', 'Machakos Town', 'Mwala',
      'Makueni', 'Kibwezi East', 'Kibwezi West', 'Mbooni', 'Kilome', 'Kaiti',
      'Gatundu North', 'Gatundu South', 'Githunguri', 'Juja', 'Kabete', 'Kiambaa', 'Kiambu', 'Kikuyu', 'Lari', 'Limuru', 'Ruiru', 'Thika Town',
      'kinangop', 'Ol Kalou', 'Ndaragwa', 'Kipipiri',
      'Tetu', 'Kieni', 'Mathira', 'Othaya', 'Nyeri Town', 'Mukurweini',
      'Mwea', 'Ndia', 'Gichugu', 'Kirinyaga Central',
      'Kandara','Kangema', 'Mathioya', 'Kiharu', 'Maragua', 'Kigumo',
      'Loima', 'Turkana North', 'Turkana East', 'Turkana Central', 'Turkana South',
      'Kapenguria', 'Kacheliba', 'Sigor', 'Pokot South',
      'Samburu East', 'Samburu North', 'Samburu West',
      'Saboti', 'Kwanza', 'Endebess', 'Kiminini',
      'Kapseret', 'Moiben', 'Turbo', 'Soy', 'Kesses', 'Ainabkoi',
      'Keiyo North', 'Keiyo South', 'Marakwet East', 'Marakwet West',
      'Emgwen', 'Aldai', 'Mosop', 'Chesumei', 'Tinderet', 'Nandi Hills',
      'Mogotio', 'Baringo North', 'Baringo Central', 'Baringo South', 'Eldama Ravine',
      'Laikipia East', 'Laikipia West', 'Laikipia North',
      'Nakuru Town East', 'Nakuru Town West', 'Subukia', 'Njoro', 'Gilgil', 'Molo', 'Rongai', 'Naivasha', 'Kuresoi South', 'Kuresoi North', 'Bahati',
      'Narok North', 'Narok South', 'Emurua Dikirr', 'Kilgoris','Narok East',
      'Kajiado East', 'Kajiado North', 'Kajiado West', 'Kajiado Central', 'Kajiado South',
      'Ainamoi', 'Bureti', 'Belgut', 'Sigowet/Soin', 'kipkelion West', 'Kipkelion East','sotik', 'Bomet East','Bomet Central','Konoin','Chepalungu',
      'Mumias East', 'Mumias West', 'Butere', 'Lugari', 'Matungu','Khwisero', 'Shinyalu', 'Ikolomani','Malava','likuyani','Lurambi',
      'Vihiga', 'Hamisi', 'Sabatia', 'Luanda', 'Emuhaya','Mt. Elgon','Sirisia','Bumula','Webuye West','Webuye East',
      'Kimilili', 'Kanduyi', 'Tongaren','kabuchia','Teso North', 'Teso South','Nambale','Matayos','Butula','Funyula','Budalangi',
      'Ugenya', 'Rarieda', 'Gem', 'Uguja','Bondo','Alego Usonga',
      'Kisumu East', 'Kisumu West', 'Kisumu Central', 'Seme','Muhoroni','Nyakach',
      'Kasipul', 'Karachuonyo', 'Homa Bay Town','Suba South', 'Rangwe', 'Ndhiwa','Kabondo Kasipul',
      'Rongo', 'Awendo', 'Uriri', 'Nyatike', 'Suna East', 'Suna West','Kuria West', 'Kuria East',
      'Bonchari','Bobasi','Bomachoge Borabu','Bomachoge Chache','Nyaribari Masaba','Nyaribari Chache','South Mugirango','Kitutu Chache North', 'Kitutu Chache South',
      'Kitutu Masaba', 'West Mugirango', 'North Mugirango', 'Borabu',
      'Dagoretti North', 'Dagoretti South', 'Langata', 'Kibra', 'Kasarani', 'Roysambu', 'Ruaraka', 'Embakasi Central', 'Embakasi East', 'Embakasi North', 'Embakasi South', 'Embakasi West', 'Kamukunji', 'Makadara', 'Mathare', 'Starehe', 'Westlands'
      )
    ),
  created_at TIMESTAMP DEFAULT NOW()
);
`,
    `CREATE TABLE IF NOT EXISTS competitors (
      id SERIAL PRIMARY KEY,
      profile BYTEA,
      name TEXT NOT NULL,
      party Text,
      poll_id INT REFERENCES polls(id)
    );`,

    `CREATE TABLE IF NOT EXISTS votes (
      id SERIAL PRIMARY KEY,
      competitor_id INT REFERENCES competitors(id),
      voted_at TIMESTAMP DEFAULT NOW()
    );`,

    `CREATE TABLE IF NOT EXISTS blog_posts (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  image_data BYTEA[],
  video_data BYTEA[],
  created_at TIMESTAMP DEFAULT NOW()
);`,
    `CREATE TABLE IF NOT EXISTS custom_polls (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);`,
    `CREATE TABLE IF NOT EXISTS custom_poll_competitors(
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  poll_id INT NOT NULL REFERENCES polls(id) ON DELETE CASCADE
);`,
    `CREATE TABLE IF NOT EXISTS custom_poll_votes (
  id SERIAL PRIMARY KEY,
  competitor_id INTEGER NOT NULL REFERENCES custom_poll_competitors(id) ON DELETE CASCADE,
  voted_at TIMESTAMP DEFAULT NOW()
);
`,
  ];

  try {
    for (const query of queries) {
      await pool.query(query);
    }
    console.log("✅ All tables are created successfully!");
  } catch (error: Error | any) {
    console.error("❌ Error creating tables:", error);
  }
};

createTables();
export default pool;
