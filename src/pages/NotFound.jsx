import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button } from '../components/ui.jsx';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas p-6 text-center">
      <span className="rounded-full bg-mist p-4 text-soft" aria-hidden="true">
        <Compass className="size-8" />
      </span>
      <div>
        <h1 className="text-2xl font-extrabold">Page not found</h1>
        <p className="mt-1 text-sm text-soft">The page you're looking for doesn't exist or has moved.</p>
      </div>
      <div className="flex gap-2">
        <Link to="/">
          <Button variant="secondary">Go home</Button>
        </Link>
        <Link to="/app">
          <Button>Open portal</Button>
        </Link>
      </div>
    </div>
  );
}
