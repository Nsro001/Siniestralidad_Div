
import { useState } from 'react'
import { FileUpload } from './components/FileUpload'
import { FilterMenu } from './components/FilterMenu'
import { PrimasReport } from './components/PrimasReport'
import { GastosReport } from './components/GastosReport'

function App() {
  const [uploadsComplete, setUploadsComplete] = useState(false);
  const [filters, setFilters] = useState<{ client: string, coverages: string[], periods: string[] } | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleUploadSuccess = () => {
    // If we want to wait for BOTH, logic is tricky in FileUpload without shared state.
    // For MVP, user manually completes uploads.
    // We can show "Done" status in FileUpload. 
    // But FilterMenu needs data.
    // We'll trigger a refresh of filters whenever an upload happens.
    setRefreshTrigger(prev => prev + 1);
  };

  const handleFilterChange = (newFilters: { client: string, coverages: string[], periods: string[] }) => {
    setFilters(newFilters);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans">
      <header className="max-w-7xl mx-auto mb-12 text-center">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">Siniestralidad Divina</h1>
        <p className="text-slate-500">Dashboard de Análisis de Primas y Gastos</p>
      </header>

      <main className="max-w-7xl mx-auto">
        <FileUpload onUploadSuccess={handleUploadSuccess} />

        <div className="border-t border-slate-200 my-8"></div>

        <FilterMenu onFilterChange={handleFilterChange} refreshTrigger={refreshTrigger} />

        {filters && filters.client && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <PrimasReport filters={filters} refreshTrigger={refreshTrigger} />
            <div className="border-t border-slate-200 my-12"></div>
            <GastosReport filters={filters} refreshTrigger={refreshTrigger} />
          </div>
        )}
      </main>
    </div>
  )
}

export default App
