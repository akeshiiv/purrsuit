import 'dotenv/config'
import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())
app.use(express.json())

// API ROUTES
app.get('/api/health', (req, res) => {
  res.json({ status: 'backend is running yipeee' })
})

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from Express!' })
})

// app.get('/api/users', async (req, res) => {
//  const { rows } = await sql`SELECT * FROM users`
//  res.json(rows)
// }) enxi u test this  it's database related 

app.post("/api/coins", (req, res) => {
  const { coins } = req.body.coins;
  console.log({ coins });
  res.json({ message: "coins rewarded!" })
} 
)

const PORT = process.env.PORT || 5000
app.listen(PORT, () => console.log('Server running on port 5000!'))