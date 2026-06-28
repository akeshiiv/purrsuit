import { useEffect, useState } from 'react';
import Card from '../components/ui/Card.jsx';
import { shopService } from '../services/index.js';

export default function Inventory() {
  const [inventory, setInventory] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    shopService.getInventory()
      .then(setInventory)
      .catch(caught => setError(caught.message));
  }, []);

  if (!inventory) return <div>Loading inventory...</div>;

  return (
    <Card className="space-y-3">
      <h1 className="text-2xl font-semibold">Inventory</h1>
      <p className="text-sm">Coins: {inventory.coins}</p>
      <p className="text-sm">A: {inventory.units.a}</p>
      <p className="text-sm">B: {inventory.units.b}</p>
      <p className="text-sm">C: {inventory.units.c}</p>
      <p className="text-sm">Total: {inventory.total}</p>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </Card>
  );
}
