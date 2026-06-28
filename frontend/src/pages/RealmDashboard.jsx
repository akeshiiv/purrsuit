import Card from '../components/ui/Card.jsx';
import { useGame } from '../components/GameContext.jsx';

export default function RealmDashboard() {
  const { realm, season, me } = useGame();

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <h1 className="text-2xl font-semibold">{realm.name}</h1>
        <p className="mt-2 text-sm">Join code: {realm.joinCode}</p>
        <p className="text-sm">Season: {season.status}</p>
      </Card>
      <Card>
        <h2 className="font-semibold">Me</h2>
        <p className="mt-2 text-sm">Coins: {me.coins}</p>
        <p className="text-sm">Units: A {me.units.a} / B {me.units.b} / C {me.units.c}</p>
        <p className="text-sm">Study: {Math.round(me.secondsStudied / 60)} min</p>
      </Card>
    </div>
  );
}
