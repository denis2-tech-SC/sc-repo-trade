import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './App.css';
import StubPage from './pages/StubPage/StubPage';
import TradePage from './pages/TradePage/TradePage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<StubPage />} />
        <Route path="/trade" element={<TradePage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
