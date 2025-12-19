import { Link, useLocation } from 'react-router-dom'

interface UploaderTabsProps {
    className?: string
}

const navItems = [
    { path: '/uploader', label: 'Dashboard' },
    { path: '/uploader/jobs', label: 'Jobs' }
]

export default function UploaderTabs({ className = '' }: UploaderTabsProps): React.JSX.Element {
    const location = useLocation()

    return (
        <div className={`flex items-center gap-4 border-b pb-4 ${className}`}>
            {navItems.map((item) => (
                <Link
                    key={item.path}
                    to={item.path}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${location.pathname === item.path
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-accent hover:text-accent-foreground'
                        }`}
                >
                    {item.label}
                </Link>
            ))}
        </div>
    )
}
