import { useEffect, useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import './App.css'

function App() {
  const startSec = 60;
  const [seconds, setSeconds] = useState(startSec);
  const [running, setRunning] = useState(false);
  const coinsEarned = startSec * 2;

  useEffect(() => {
    if (!running) return;
    const intervalId = setInterval(() => {
      setSeconds(sec => {
      if (sec === 1)
        fetch('http://localhost:5000/api/coins', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: 1, unitType: 'study', duration: 60, coins: coinsEarned })
        }).then(r => r.json()).then(console.log)
      return sec > 0 ? sec - 1 : sec;});
    }, 1000);
    return () => clearInterval(intervalId);
  }, [running]);

  function handleStartStop() {
    if (!running) {
      setRunning(true);
    } else {
      setSeconds(startSec);
      setRunning(false);
    }
  }

  const minutes = Math.floor(seconds / 60);
  const remSeconds = seconds % 60;

  return (
      <section id="center">
        <h1 className="brand-title font-bold text-6xl">Purrsuit</h1>
        <div className="container">
            <h2 className="header text-2xl">Studying in progress...</h2>
          <div>
            {minutes < 10 ? "0" + minutes : minutes}:
            {remSeconds < 10 ? "0" + remSeconds : remSeconds}
          </div>
          <div>
            <button onClick={handleStartStop} className="hover:bg-gray-200 border-2">{running ? "Stop" : "Start"}</button>
          </div>
        </div>
        <div>

        </div>
      </section>
  )
}

export default App
