import React from 'react';
import { ChevronDown } from 'lucide-react';

interface AssaySelectorProps {
  selectedAssay: string;
  onAssayChange: (assay: string) => void;
}

const AssaySelector: React.FC<AssaySelectorProps> = ({ selectedAssay, onAssayChange }) => {
  const assays = [
    'Todos os frascos',
    'Frasco 1',
    'Frasco 2', 
    'Frasco 3',
    'Frasco 4'
  ];

  return (
    <div className="relative">
      <select
        value={selectedAssay}
        onChange={(e) => onAssayChange(e.target.value)}
        className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-8 text-sm font-medium text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
      >
        {assays.map((assay) => (
          <option key={assay} value={assay}>
            {assay}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
    </div>
  );
};

export default AssaySelector;