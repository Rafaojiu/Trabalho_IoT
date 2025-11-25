import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

interface PressureControlProps {
  reliefPressure: number;
  onChange: (pressure: number) => void;
}

const PressureControl: React.FC<PressureControlProps> = ({ reliefPressure, onChange }) => {
  const [showWarning, setShowWarning] = useState(false);

  const handlePressureChange = (pressure: number) => {
    onChange(pressure);
    setShowWarning(pressure > 5.0);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Controle de Pressão de Alívio</h3>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Pressão de Alívio (bar)
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="10"
            value={reliefPressure}
            onChange={(e) => handlePressureChange(parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        {showWarning && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-red-500 mr-2" />
              <span className="text-red-800 font-medium">
                Atenção: Pressão acima de 5 bar apresenta risco de "crash" dos vasos de pressão!
              </span>
            </div>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
          <p className="text-sm text-blue-800">
            <strong>Funcionamento:</strong> Quando a pressão atingir o valor configurado, 
            a solenoide abrirá por 1 segundo para alívio de pressão e depois fechará automaticamente.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PressureControl;