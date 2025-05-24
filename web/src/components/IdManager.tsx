import React, { useState, useEffect } from 'react';

interface IdManagerProps {
  listId: string;
  onListIdChange: (id: string) => void;
}

function generateRandomId(): string {
  // Generate a random 24-character ID
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 24; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const IdManager: React.FC<IdManagerProps> = ({ listId, onListIdChange }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(listId);

  useEffect(() => {
    setInputValue(listId);
  }, [listId]);

  const handleSave = () => {
    if (inputValue.trim().length >= 8) {
      onListIdChange(inputValue.trim());
      setIsEditing(false);
    } else {
      alert('ID must be at least 8 characters long for security');
    }
  };

  const handleGenerateNew = () => {
    const newId = generateRandomId();
    setInputValue(newId);
    onListIdChange(newId);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setInputValue(listId);
    setIsEditing(false);
  };

  return (
    <div className="bg-white border rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold text-gray-800">Your Todo List ID</h3>
        <div className="flex gap-2">
          {!isEditing ? (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Edit
              </button>
              <button
                onClick={handleGenerateNew}
                className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
              >
                Generate New
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleSave}
                disabled={inputValue.trim().length < 8}
                className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
              >
                Save
              </button>
              <button
                onClick={handleCancel}
                className="px-3 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
      
      {!isEditing ? (
        <div className="font-mono text-sm bg-gray-100 p-2 rounded border break-all">
          {listId || 'No ID set'}
        </div>
      ) : (
        <div>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Enter your list ID (minimum 8 characters)"
            className="w-full font-mono text-sm p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="text-xs text-gray-600 mt-1">
            Make your ID long and unique to prevent others from guessing it. 
            {inputValue.length < 8 && (
              <span className="text-red-600 font-semibold"> Need at least 8 characters.</span>
            )}
          </div>
        </div>
      )}
      
      <div className="text-xs text-gray-600 mt-2">
        <p><strong>Important:</strong> This ID gives access to your tasks and comparisons. Keep it private!</p>
        <p>Share this ID only with people you want to collaborate with on this todo list.</p>
      </div>
    </div>
  );
};

export default IdManager; 