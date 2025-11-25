import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BarChart3, Settings, Activity, FlaskConical } from 'lucide-react'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()

  const navigation = [
    { name: 'Dashboard', href: '/', icon: BarChart3 },
    { name: 'Ensaios', href: '/assays', icon: FlaskConical },
    { name: 'Configurações', href: '/settings', icon: Settings },
  ]

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/'
    }
    return location.pathname.startsWith(path)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg">
        <div className="flex h-16 items-center justify-center bg-primary-600">
          <div className="flex items-center space-x-2">
            <Activity className="h-8 w-8 text-white" />
            <h1 className="text-xl font-bold text-white">RR Rural Fermentation</h1>
          </div>
        </div>
        
        <nav className="mt-8 px-4">
          <ul className="space-y-2">
            {navigation.map((item) => (
              <li key={item.name}>
                <Link
                  to={item.href}
                  className={`flex items-center space-x-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive(item.href)
                      ? 'bg-primary-100 text-primary-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <item.icon className="h-5 w-5" />
                  <span>{item.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* Main content */}
      <div className="ml-64">
        <main className="p-6">{children}</main>
      </div>
    </div>
  )
}