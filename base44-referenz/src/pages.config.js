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
 *   import __Layout from './Layout.jsx';
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
import Analytics from './pages/Analytics';
import ApiDocs from './pages/ApiDocs';
import ApiLogs from './pages/ApiLogs';
import Dashboard from './pages/Dashboard';
import DeliveryNoteAssignment from './pages/DeliveryNoteAssignment';
import DeliveryNoteDetail from './pages/DeliveryNoteDetail';
import DeliveryNoteList from './pages/DeliveryNoteList';
import DocumentOverview from './pages/DocumentOverview';
import Home from './pages/Home';
import InvoiceDetail from './pages/InvoiceDetail';
import InvoiceList from './pages/InvoiceList';
import OfferDetail from './pages/OfferDetail';
import OfferList from './pages/OfferList';
import Papierkorb from './pages/Papierkorb';
import PowerSuche from './pages/PowerSuche';
import ProductList from './pages/ProductList';
import RustlerUpload from './pages/RustlerUpload';
import SelfOnboarding from './pages/SelfOnboarding';
import Settings from './pages/Settings';
import VermittlerList from './pages/VermittlerList';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Analytics": Analytics,
    "ApiDocs": ApiDocs,
    "ApiLogs": ApiLogs,
    "Dashboard": Dashboard,
    "DeliveryNoteAssignment": DeliveryNoteAssignment,
    "DeliveryNoteDetail": DeliveryNoteDetail,
    "DeliveryNoteList": DeliveryNoteList,
    "DocumentOverview": DocumentOverview,
    "Home": Home,
    "InvoiceDetail": InvoiceDetail,
    "InvoiceList": InvoiceList,
    "OfferDetail": OfferDetail,
    "OfferList": OfferList,
    "Papierkorb": Papierkorb,
    "PowerSuche": PowerSuche,
    "ProductList": ProductList,
    "RustlerUpload": RustlerUpload,
    "SelfOnboarding": SelfOnboarding,
    "Settings": Settings,
    "VermittlerList": VermittlerList,
}

export const pagesConfig = {
    mainPage: "OfferList",
    Pages: PAGES,
    Layout: __Layout,
};