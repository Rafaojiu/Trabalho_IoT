import React, { useState } from 'react';
import { Play, Square, AlertOctagon, Clock } from 'lucide-react';

interface AssayControlProps {
  onStart: (options: StartOptions) => void;
  onStop: (flaskId: number, duration: number) => void;
  onShutdown: () => void;
}

interface StartOptions {
  delay: number;
  equalizePressure: boolean;
}

const AssayControl: React.FC<AssayControlProps> = ({ onStart, onStop, onShutdown }) => {
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState<number | null>(null);
  const [selectedDurations, setSelectedDurations] = useState<{[key: number]: number}>({});

  const durations = [
    { value: 12, label: '12h' },
    { value: 24, label: '24h' },
    { value: 36, label: '36h' },
    { value: 48, label: '48h' },
    { value: 60, label: '60h' },
    { value: 72, label: '72h' }
  ];

  const handleStart = async () => {
    setIsStarting(true);
    try {
      await onStart({
        delay: 10,
        equalizePressure: true
      });
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async (flaskId: number) => {
    const duration = selectedDurations[flaskId] || 48;
    setIsStopping(flaskId);
    try {
      await onStop(flaskId, duration);
    } finally {
      setIsStopping(null);
    }
  };

  const handleDurationChange = (flaskId: number, duration: number) => {
    setSelectedDurations(prev => ({ ...prev, [flaskId]: duration }));
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Controle de Ensaios</h3>
      
      {/* Controle Geral */}
      <div className="flex space-x-4 mb-6">
        <button
          onClick={handleStart}
          disabled={isStarting}
          className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
        >
          <Play className="h-4 w-4 mr-2" />
          {isStarting ? (
            <span className="flex items-center">
              <Clock className="h-4 w-4 mr-2 animate-spin" />
              Iniciando...
            </span>
          ) : (
            'START'
          )}
        </button>

        <button
          onClick={onShutdown}
          className="flex items-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
        >
          <AlertOctagon className="h-4 w-4 mr-2" />
          SHUTDOWN
        </button>
      </div>

      {/* Controle Individual por Vaso */}
      <div className="space-y-4">
        <h4 className="text-md font-medium text-gray-700">Controle Individual</h4>
        
        {[1, 2, 3, 4].map((flaskId) => (
          <div key={flaskId} className="flex items-center space-x-4 p-3 bg-gray-50 rounded-md">
            <span className="text-sm font-medium text-gray-700 w-20">
              Vaso {flaskId}:
            </span>
            
            <select
              value={selectedDurations[flaskId] || 48}
              onChange={(e) => handleDurationChange(flaskId, parseInt(e.target.value))}
              className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {durations.map((duration) => (
                <option key={duration.value} value={duration.value}>
                  {duration.label}
                </option>
              ))}
            </select>

            <button
              onClick={() => handleStop(flaskId)}
              disabled={isStopping === flaskId}
              className="flex items-center px-3 py-1 bg-orange-600 text-white rounded-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50 text-sm"
            >
              <Square className="h-3 w-3 mr-1" />
              {isStopping === flaskId ? 'Parando...' : 'STOP'}
            </button>
          </div>
        ))}
      </div>

      {/* Informações de Funcionamento */}
      <div className="mt-6 space-y-2 text-sm text-gray-600">
        <p><strong>START:</strong> Delay de 10s com solenoide aberto para equalização de pressão</p>
        <p><strong>STOP:</strong> Abre solenoide permanentemente após tempo selecionado</p>
        <p><strong>SHUTDOWN:</strong> Abre todos os solenoides permanentemente (emergência)</p>
      </div>
    </div>
  );
};

export default AssayControl;