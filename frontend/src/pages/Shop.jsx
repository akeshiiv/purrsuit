import { useEffect, useState } from 'react';
import { useGame } from '../components/GameContext.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import { shopService } from '../services/index.js';

export default function Shop() {
  const { refresh } = useGame();
  const [inventory, setInventory] = useState(null);
  const [message, setMessage] = useState('');

  async function loadInventory() {
    setInventory(await shopService.getInventory());
  }

  useEffect(() => {
    shopService.getInventory()
      .then(setInventory)
      .catch(caught => setMessage(caught.message));
  }, []);

  async function buy(unitType) {
    setMessage('');
    try {
      await shopService.buy({ unitType });
      await loadInventory();
      await refresh();
      setMessage(`Bought ${unitType}`);
    } catch (caught) {
      setMessage(caught.message);
    }
  }

  if (!inventory) return <div>Loading shop...</div>;

  return (
    <Card className="space-y-4">
      <h1 className="text-2xl font-semibold">Shop</h1>
      <p className="text-sm">Coins: {inventory.coins}</p>
      <div className="flex flex-wrap gap-2">
        {['A', 'B', 'C'].map(unitType => (
          <Button
            disabled={!inventory.actions.canBuy}
            key={unitType}
            onClick={() => buy(unitType)}
          >
            Buy {unitType}
          </Button>
        ))}
      </div>
      {message && <p className="text-sm">{message}</p>}
    </Card>
  );
}
