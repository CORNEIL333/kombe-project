import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import '@kombe/dashboard-core/tokens';
import '@kombe/dashboard-core/styles';
import './crm.css';
import {App} from './App';
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
