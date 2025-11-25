import React, { useState, useEffect } from 'react';

interface FlaskConfigData {
  accumulatedPressure: number;
  volume: number;
  solutionVolume: number;
  moles: number;
  temperature: number;
}

interface FlaskConfigProps {
  flaskId: number;
  initialData: FlaskConfigData;
  onChange: (data: FlaskConfigData) => void;
}

const FlaskConfig: React.FC<FlaskConfigProps> = ({ flaskId, initialData, onChange }) => {
  const [data, setData] = useState<FlaskConfigData>(initialData);
  const [headspaceVolume, setHeadspaceVolume] = useState(0);

  const R = 0.08314; // Constante dos gases L·bar/mol·K

  useEffect(() => {
    // Calcular volume do headspace: 350ml - volume da solução
    const headspace = (350 - data.solutionVolume) / 1000; // Converter para litros
    setHeadspaceVolume(headspace);

    // Calcular número de mols usando PV = nRT => n = PV/RT
    const temperatureK = data.temperature + 273.15; // Converter Celsius para Kelvin
    const calculatedMoles = (data.accumulatedPressure * headspace) / (R * temperatureK);

    const newData = {
      ...data,
      moles: calculatedMoles
    };

    setData(newData);
    onChange(newData);
  }, [data.accumulatedPressure, data.volume, data.solutionVolume, data.temperature]);

  const handleInputChange = (field: keyof FlaskConfigData, value: number) => {
    const newData = { ...data, [field]: value };
    setData(newData);
    onChange(newData);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Vaso de Ensaio {flaskId}</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Pressão Acumulada (bar abs)
          </label>
          <input
            type="number"
            step="0.1"
            value={data.accumulatedPressure}
            onChange={(e) => handleInputChange('accumulatedPressure', parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Volume Total (L)
          </label>
          <input
            type="number"
            step="0.1"
            value={data.volume}
            onChange={(e) => handleInputChange('volume', parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Volume da Solução (ml)
          </label>
          <input
            type="number"
            step="1"
            value={data.solutionVolume}
            onChange={(e) => handleInputChange('solutionVolume', parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Temperatura (°C)
          </label>
          <input
            type="number"
            step="0.1"
            value={data.temperature}
            onChange={(e) => handleInputChange('temperature', parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        <div className="md:col-span-2">
          <div className="bg-gray-50 rounded-md p-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Volume do Headspace:</span>
                <span className="ml-2 font-medium text-gray-800">{headspaceVolume.toFixed(3)} L</span>
              </div>
              <div>
                <span className="text-gray-600">Nº de Mols (n = PV/RT):</span>
                <span className="ml-2 font-medium text-gray-800">{data.moles.toFixed(6)} mol</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FlaskConfig;