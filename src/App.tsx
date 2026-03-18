import { HashRouter, Routes, Route } from 'react-router-dom';
import './App.css';
import StubPage from './pages/StubPage/StubPage';
import TradePage from './pages/TradePage/TradePage';

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<StubPage />} />
        <Route path="/trade" element={<TradePage />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
