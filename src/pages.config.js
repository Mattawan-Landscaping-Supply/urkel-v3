/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import LightspeedMapping from './pages/LightspeedMapping';
import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import ArchivedOrders from './pages/ArchivedOrders';
import CompletedOrders from './pages/CompletedOrders';
import CustomerDetails from './pages/CustomerDetails';
import Customers from './pages/Customers';
import Dashboard from './pages/Dashboard';
import Deliver from './pages/Deliver';
import DeliveryCalendar from './pages/DeliveryCalendar';
import Home from './pages/Home';
import LoadDetails from './pages/LoadDetails';
import OptimizeDelivery from './pages/OptimizeDelivery';
import OrderDetails from './pages/OrderDetails';
import PrintReceipt from './pages/PrintReceipt';
import PrintSchedule from './pages/PrintSchedule';
import PrintView from './pages/PrintView';
import PrintableSummary from './pages/PrintableSummary';
import ProductCatalog from './pages/ProductCatalog';
import Settings from './pages/Settings';
import TruckSettings from './pages/TruckSettings';
import LightspeedMapping from './pages/LightspeedMapping';
import __Layout from './Layout.jsx';


export const PAGES = {
    "ArchivedOrders": ArchivedOrders,
    "CompletedOrders": CompletedOrders,
    "CustomerDetails": CustomerDetails,
    "Customers": Customers,
    "Dashboard": Dashboard,
    "Deliver": Deliver,
    "DeliveryCalendar": DeliveryCalendar,
    "Home": Home,
    "LoadDetails": LoadDetails,
    "OptimizeDelivery": OptimizeDelivery,
    "OrderDetails": OrderDetails,
    "PrintReceipt": PrintReceipt,
    "PrintSchedule": PrintSchedule,
    "PrintView": PrintView,
    "PrintableSummary": PrintableSummary,
    "ProductCatalog": ProductCatalog,
    "Settings": Settings,
    "TruckSettings": TruckSettings,
    "LightspeedMapping": LightspeedMapping,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};