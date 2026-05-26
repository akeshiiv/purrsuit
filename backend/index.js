import 'dotenv/config'
import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())
app.use(express.json())

// API ROUTES
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from Express!' })
})

app.get('/api/users', async (req, res) => {
  const { rows } = await sql`SELECT * FROM users`
  res.json(rows)
})

app.listen(3000, () => console.log('Server running on port 3000'))