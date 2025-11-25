import React from 'react';

interface TemperatureSwitchProps {
  isCelsius: boolean;
  onToggle: (isCelsius: boolean) => void;
}

const TemperatureSwitch: React.FC<TemperatureSwitchProps> = ({ isCelsius, onToggle }) => {
  return (
    <div className="flex items-center space-x-2">
      <span className={`text-sm font-medium ${isCelsius ? 'text-green-600' : 'text-gray-500'}`}>
        °C
      </span>
      <button
        onClick={() => onToggle(!isCelsius)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
          isCelsius ? 'bg-green-600' : 'bg-gray-200'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            isCelsius ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
      <span className={`text-sm font-medium ${!isCelsius ? 'text-green-600' : 'text-gray-500'}`}>
        K
      </span>
    </div>
  );
};

export default TemperatureSwitch;