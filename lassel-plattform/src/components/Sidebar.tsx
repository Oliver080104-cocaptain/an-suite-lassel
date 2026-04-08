'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
  Upload,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navigation = [
  { name: 'Angebote', href: '/angebote', icon: FileText, match: ['/angebote'] },
  { name: 'Lieferscheine', href: '/lieferscheine', icon: Truck, match: ['/lieferscheine'] },
  { name: 'Rechnungen', href: '/rechnungen', icon: Receipt, match: ['/rechnungen'] },
  { name: 'Produkte', href: '/produkte', icon: FileText, match: ['/produkte'] },
  {
    name: 'Sonstiges',
    icon: FileText,
    submenu: [
      { name: 'Rustler', href: '/hausverwaltungen', icon: Upload },
      { name: 'Vermittler', href: '/vermittler', icon: Users },
      { name: 'Analytics', href: '/analytics', icon: LayoutDashboard },
    ],
  },
  {
    name: 'Einstellungen',
    icon: Settings,
    submenu: [
      { name: 'API Docs', href: '/einstellungen/api-docs', icon: Code },
      { name: 'API Logs', href: '/einstellungen/api-logs', icon: Code },
      { name: 'Papierkorb', href: '/papierkorb', icon: Code },
      { name: 'Firmendaten', href: '/einstellungen', icon: Settings },
      { name: 'Textvorlagen', href: '/einstellungen/textvorlagen', icon: FileText },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({})

  return (
    <>
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

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
              src="/logo.png"
              alt="Lassel GmbH"
              className="h-8 w-auto"
            />
          </div>
          <div className="w-10" />
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full bg-white border-r border-slate-200 transform transition-all duration-200 ease-in-out lg:translate-x-0 flex flex-col',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          sidebarCollapsed ? 'lg:w-16 w-16' : 'lg:w-64 w-64'
        )}
      >
        <div className="flex items-center justify-between h-16 px-6 border-b border-slate-200 flex-shrink-0">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2">
              <img
                src="/logo.png"
                alt="Lassel GmbH"
                className="h-12 w-auto object-contain"
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
            const hasSubmenu = 'submenu' in item && item.submenu && item.submenu.length > 0
            const isActive = !hasSubmenu && 'href' in item && (
              pathname === item.href || pathname.startsWith(item.href + '/')
            )
            const isSubmenuActive = hasSubmenu && item.submenu!.some(
              (sub) => pathname === sub.href || pathname.startsWith(sub.href + '/')
            )
            const isExpanded = expandedMenus[item.name] ?? isSubmenuActive

            return (
              <div key={item.name}>
                {hasSubmenu ? (
                  <>
                    <button
                      onClick={() =>
                        setExpandedMenus((prev) => ({ ...prev, [item.name]: !isExpanded }))
                      }
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group',
                        isSubmenuActive
                          ? 'bg-orange-600 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-orange-50 hover:text-orange-600'
                      )}
                    >
                      <item.icon
                        className={cn(
                          'w-5 h-5 transition-colors flex-shrink-0',
                          isSubmenuActive
                            ? 'text-white'
                            : 'text-slate-400 group-hover:text-orange-600'
                        )}
                      />
                      {!sidebarCollapsed && (
                        <>
                          <div className="flex-1 text-left">
                            <span className="font-medium">{item.name}</span>
                          </div>
                          <ChevronRight
                            className={cn(
                              'w-4 h-4 transition-transform',
                              isExpanded && 'rotate-90'
                            )}
                          />
                        </>
                      )}
                    </button>
                    {isExpanded && !sidebarCollapsed && (
                      <div className="ml-8 mt-1 space-y-1">
                        {item.submenu!.map((subItem) => {
                          const isSubActive =
                            pathname === subItem.href || pathname.startsWith(subItem.href + '/')
                          return (
                            <Link
                              key={subItem.name}
                              href={subItem.href}
                              onClick={() => setSidebarOpen(false)}
                              className={cn(
                                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all',
                                isSubActive
                                  ? 'bg-orange-100 text-orange-900 font-medium'
                                  : 'text-slate-600 hover:bg-orange-50 hover:text-orange-600'
                              )}
                            >
                              {subItem.name}
                            </Link>
                          )
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <Link
                    href={(item as { href: string }).href}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group',
                      isActive
                        ? 'bg-orange-600 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-orange-50 hover:text-orange-600'
                    )}
                  >
                    <item.icon
                      className={cn(
                        'w-5 h-5 transition-colors flex-shrink-0',
                        isActive ? 'text-white' : 'text-slate-400 group-hover:text-orange-600'
                      )}
                    />
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
            )
          })}
        </nav>

        {/* Collapse Button */}
        <div className="hidden lg:block p-4 border-t border-slate-200 flex-shrink-0">
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

      {/* Sidebar spacer for desktop */}
      <div
        className={cn(
          'hidden lg:block flex-shrink-0 transition-all duration-200',
          sidebarCollapsed ? 'w-16' : 'w-64'
        )}
      />
    </>
  )
}
