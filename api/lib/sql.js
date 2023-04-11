const mysql = require('mysql2/promise')

const pool = mysql.createPool({
	host: 'db-TEMPLATE',
	user: process.env.DATABASE_USER,
	password: process.env.DATABASE_PASSWORD,
	database: process.env.DATABASE_DBNAME,
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0
})

module.exports = pool