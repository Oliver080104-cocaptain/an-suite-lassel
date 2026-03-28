import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  LayoutDashboard, 
  FileText, 
  Receipt, 
  Settings, 
  Menu, 
  X,
  Code,
  ChevronRight,
  Truck,
  ChevronLeft,
  Users,
  Search,
  Upload
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navigation = [
  { name: 'Angebote', page: 'OfferList', icon: FileText },
  { name: 'Lieferscheine', page: 'DeliveryNoteList', icon: Truck },
  { name: 'Rechnungen', page: 'InvoiceList', icon: Receipt },
  { name: 'Produkte', page: 'ProductList', icon: FileText },
  { 
    name: 'Sonstiges', 
    page: 'Sonstiges', 
    icon: FileText,
    submenu: [
      { name: 'Rustler', page: 'RustlerUpload', icon: Upload },
      { name: 'Vermittler', page: 'VermittlerList', icon: Users },
      { name: 'Power Suche', page: 'PowerSuche', icon: Search },
      { name: 'Analytics', page: 'Analytics', icon: LayoutDashboard },
      { name: 'Lieferschein Zuweisung', page: 'DeliveryNoteAssignment', icon: Truck }
    ]
  },
  { 
    name: 'Einstellungen', 
    page: 'Settings', 
    icon: Settings,
    submenu: [
      { name: 'API Docs', page: 'ApiDocs', icon: Code },
      { name: 'API Logs', page: 'ApiLogs', icon: Code },
      { name: 'Papierkorb', page: 'Papierkorb', icon: Code },
      { name: 'Firmendaten', page: 'Settings', icon: Settings }
    ]
  },
];

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState({});

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 z-50 h-full bg-white border-r border-slate-200 transform transition-all duration-200 ease-in-out lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full",
        sidebarCollapsed ? "lg:w-16 w-16" : "lg:w-64 w-64"
      )}>
        <div className="flex items-center justify-between h-16 px-6 border-b border-slate-200">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2">
              <img 
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6937375d862a164b90207fd3/b10c4c5fb_lassel_logo-removebg-preview.png" 
                alt="Lassel GmbH" 
                className="h-10 w-auto"
              />
            </div>
          )}
          <button 
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 text-slate-500 hover:text-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="p-4 space-y-1 flex-1 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = currentPageName === item.page || 
              (item.page === 'OfferList' && currentPageName === 'OfferDetail') ||
              (item.page === 'DeliveryNoteList' && currentPageName === 'DeliveryNoteDetail') ||
              (item.page === 'InvoiceList' && currentPageName === 'InvoiceDetail') ||
              (item.page === 'Analytics' && currentPageName === 'Analytics') ||
              (item.page === 'VermittlerList' && currentPageName === 'VermittlerList');

            const hasSubmenu = item.submenu && item.submenu.length > 0;
            const isSubmenuActive = hasSubmenu && item.submenu.some(sub => 
              currentPageName === sub.page ||
              (sub.page === 'ApiDocs' && currentPageName === 'ApiDocs') ||
              (sub.page === 'ApiLogs' && currentPageName === 'ApiLogs')
            );
            const isExpanded = expandedMenus[item.name] || isSubmenuActive;

            return (
              <div key={item.name}>
                {hasSubmenu ? (
                  <>
                    <button
                      onClick={() => setExpandedMenus({ ...expandedMenus, [item.name]: !isExpanded })}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group",
                        isSubmenuActive 
                          ? "bg-orange-600 text-white shadow-sm" 
                          : "text-slate-600 hover:bg-orange-50 hover:text-orange-600"
                      )}
                    >
                      <item.icon className={cn(
                        "w-5 h-5 transition-colors flex-shrink-0",
                        isSubmenuActive ? "text-white" : "text-slate-400 group-hover:text-orange-600"
                      )} />
                      {!sidebarCollapsed && (
                        <>
                          <div className="flex-1 text-left">
                            <span className="font-medium">{item.name}</span>
                          </div>
                          <ChevronRight className={cn(
                            "w-4 h-4 transition-transform",
                            isExpanded && "rotate-90"
                          )} />
                        </>
                      )}
                    </button>
                    {isExpanded && !sidebarCollapsed && (
                      <div className="ml-8 mt-1 space-y-1">
                        {item.submenu.map((subItem) => {
                          const isSubActive = currentPageName === subItem.page;
                          return (
                            <Link
                              key={subItem.name}
                              to={createPageUrl(subItem.page)}
                              onClick={() => setSidebarOpen(false)}
                              className={cn(
                                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all",
                                isSubActive 
                                  ? "bg-orange-100 text-orange-900 font-medium" 
                                  : "text-slate-600 hover:bg-orange-50 hover:text-orange-600"
                              )}
                            >
                              {subItem.name}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <Link
                    to={createPageUrl(item.page)}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group",
                      isActive 
                        ? "bg-orange-600 text-white shadow-sm" 
                        : "text-slate-600 hover:bg-orange-50 hover:text-orange-600"
                    )}
                  >
                    <item.icon className={cn(
                      "w-5 h-5 transition-colors flex-shrink-0",
                      isActive ? "text-white" : "text-slate-400 group-hover:text-orange-600"
                    )} />
                    {!sidebarCollapsed && (
                      <>
                        <div className="flex-1">
                          <span className="font-medium">{item.name}</span>
                        </div>
                        {isActive && <ChevronRight className="w-4 h-4" />}
                      </>
                    )}
                  </Link>
                )}
              </div>
            );
          })}
        </nav>

        {/* Collapse Button */}
        <div className="hidden lg:block p-4 border-t border-slate-200">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full flex items-center justify-center gap-2 p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <>
                <ChevronLeft className="w-5 h-5" />
                <span className="text-sm">Einklappen</span>
              </>
            )}
          </button>
        </div>
        </aside>

      {/* Main content */}
      <div className={cn("transition-all duration-200", sidebarCollapsed ? "lg:pl-16" : "lg:pl-64")}>
        {/* Mobile header */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 lg:hidden">
          <div className="flex items-center justify-between h-16 px-4">
            <button 
              onClick={() => setSidebarOpen(true)}
              className="p-2 text-slate-500 hover:text-slate-700"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-2">
              <img 
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6937375d862a164b90207fd3/b10c4c5fb_lassel_logo-removebg-preview.png" 
                alt="Lassel GmbH" 
                className="h-8 w-auto"
              />
            </div>
            <div className="w-10" /> {/* Spacer */}
          </div>
        </header>

        {/* Page content */}
        <main>
          {children}
        </main>
      </div>
    </div>
  );
}