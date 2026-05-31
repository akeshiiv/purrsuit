import { useEffect, useState } from 'react'
import './App.css'

import { useAuth } from './components/AuthContext.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';

export default function App() {
  const { loggedIn } = useAuth();
  return loggedIn ? <Dashboard/> : <Login/>;
}