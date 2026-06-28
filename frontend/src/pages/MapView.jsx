import { useCallback, useState } from 'react';
import { useGame } from '../components/GameContext.jsx';
import CellTile from '../components/ui/CellTile.jsx';
import Card from '../components/ui/Card.jsx';
import { usePolling } from '../hooks/usePolling.js';
import { mapService } from '../services/index.js';

export default function MapView() {
  const { me, refresh } = useGame();
  const [mapState, setMapState] = useState(null);
  const [unitType, setUnitType] = useState('A');
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState('');

  const loadMap = useCallback(async since => {
    const next = await mapService.getMap(since);
    if (next.changed !== false) setMapState(next);
    return next;
  }, []);

  const { error } = usePolling(loadMap, 2500);

  async function handleCellClick(cell) {
    setMessage('');

    try {
      if (cell.ownerMemberId === me.id && cell.unitType) {
        await mapService.defend({ x: cell.x, y: cell.y, unitType: cell.unitType });
        setMessage('Defended');
      } else {
        const result = await mapService.attack({
          x: cell.x,
          y: cell.y,
          unitType,
          quantity: Number(quantity),
        });
        setMessage(result.result);
      }
      await loadMap(null);
      await refresh();
    } catch (caught) {
      setMessage(caught.message);
    }
  }

  if (!mapState) return <div>Loading map...</div>;

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3">
        <h1 className="w-full text-2xl font-semibold">Map</h1>
        <label className="text-sm">
          Unit
          <select
            className="ml-2 rounded border px-2 py-1"
            onChange={event => setUnitType(event.target.value)}
            value={unitType}
          >
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
          </select>
        </label>
        <label className="text-sm">
          Quantity
          <input
            className="ml-2 w-16 rounded border px-2 py-1"
            min="1"
            onChange={event => setQuantity(event.target.value)}
            type="number"
            value={quantity}
          />
        </label>
        {message && <p className="text-sm">{message}</p>}
        {error && <p className="text-sm text-red-700">{error.message}</p>}
      </Card>
      <div
        className="grid max-w-xl gap-1"
        style={{ gridTemplateColumns: `repeat(${mapState.size}, minmax(0, 1fr))` }}
      >
        {mapState.cells.map(cell => (
          <CellTile
            key={`${cell.x}-${cell.y}`}
            cell={cell}
            onClick={handleCellClick}
          />
        ))}
      </div>
    </div>
  );
}
