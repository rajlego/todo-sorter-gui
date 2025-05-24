import React, { useEffect, useState, useMemo, useCallback } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
}

const Editor: React.FC<EditorProps> = ({ value, onChange }) => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [viewMode, setViewMode] = useState<'editor' | 'lines'>('editor');

  // Detect system dark mode preference
  useEffect(() => {
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDarkMode(darkModeQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setIsDarkMode(e.matches);
    };

    darkModeQuery.addEventListener('change', handleChange);
    return () => darkModeQuery.removeEventListener('change', handleChange);
  }, []);

  // Memoized extensions to avoid recreation on every render
  const extensions = useMemo(() => [markdown()], []);

  // Parse lines and extract task info
  const lines = useMemo(() => {
    return value.split('\n').map((line, index) => {
      const trimmedLine = line.trim();
      const isComment = trimmedLine.startsWith('#');
      const isEmpty = !trimmedLine;
      
      // Check if line has ranking info
      const rankingMatch = trimmedLine.match(/^(.+?)\s+\|\s+Rank:\s+(\d+)\s+\|\s+Score:\s+([-\d.]+)$/);
      const hasRanking = !!rankingMatch;
      
      let taskContent = trimmedLine;
      let rank = null;
      let score = null;
      
      if (rankingMatch) {
        taskContent = rankingMatch[1];
        rank = parseInt(rankingMatch[2]);
        score = parseFloat(rankingMatch[3]);
      }
      
      return {
        index,
        original: line,
        trimmed: trimmedLine,
        taskContent,
        isComment,
        isEmpty,
        hasRanking,
        rank,
        score
      };
    });
  }, [value]);

  // Handle deleting a line
  const handleDeleteLine = useCallback((lineIndex: number) => {
    const newLines = value.split('\n').filter((_, index) => index !== lineIndex);
    onChange(newLines.join('\n'));
  }, [value, onChange]);

  // Handle clearing score from a line
  const handleClearScore = useCallback((lineIndex: number) => {
    const currentLines = value.split('\n');
    const line = currentLines[lineIndex];
    
    // Remove ranking info if present
    const rankingMatch = line.match(/^(.+?)\s+\|\s+Rank:\s+\d+\s+\|\s+Score:\s+[-\d.]+$/);
    if (rankingMatch) {
      currentLines[lineIndex] = rankingMatch[1];
      onChange(currentLines.join('\n'));
    }
  }, [value, onChange]);

  // Handle direct line editing
  const handleLineEdit = useCallback((lineIndex: number, newContent: string) => {
    const currentLines = value.split('\n');
    currentLines[lineIndex] = newContent;
    onChange(currentLines.join('\n'));
  }, [value, onChange]);

  return (
    <div className="h-full flex flex-col">
      {/* View Mode Toggle */}
      <div className="flex justify-end p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
        <div className="flex rounded-md shadow-sm">
          <button
            onClick={() => setViewMode('editor')}
            className={`px-3 py-1 text-xs font-medium rounded-l-md transition-colors ${
              viewMode === 'editor'
                ? 'bg-indigo-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            Editor
          </button>
          <button
            onClick={() => setViewMode('lines')}
            className={`px-3 py-1 text-xs font-medium rounded-r-md transition-colors ${
              viewMode === 'lines'
                ? 'bg-indigo-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 border-l-0 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            Line Actions
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'editor' ? (
          <CodeMirror
            value={value}
            onChange={onChange}
            extensions={extensions}
            theme={isDarkMode ? 'dark' : 'light'}
            height="100%"
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              dropCursor: false,
              allowMultipleSelections: false,
            }}
            className="h-full"
          />
        ) : (
          <div className="h-full overflow-y-auto bg-white dark:bg-gray-800">
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {lines.map((line) => (
                <div
                  key={line.index}
                  className="flex items-center hover:bg-gray-50 dark:hover:bg-gray-700/50 group"
                >
                  {/* Line Number */}
                  <div className="flex-shrink-0 w-12 px-2 py-2 text-xs text-gray-500 dark:text-gray-400 text-center border-r border-gray-200 dark:border-gray-700">
                    {line.index + 1}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex-shrink-0 flex items-center space-x-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!line.isEmpty && !line.isComment && (
                      <>
                        {/* Delete Button */}
                        <button
                          onClick={() => handleDeleteLine(line.index)}
                          className="p-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          title="Delete line"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>

                        {/* Clear Score Button */}
                        {line.hasRanking && (
                          <button
                            onClick={() => handleClearScore(line.index)}
                            className="p-1 rounded text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                            title="Clear score"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 002.828 0L18 12M3 12l6.414-6.414a2 2 0 012.828 0L18 12" />
                            </svg>
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {/* Line Content */}
                  <div className="flex-1 min-w-0 py-2 pr-4">
                    <input
                      type="text"
                      value={line.original}
                      onChange={(e) => handleLineEdit(line.index, e.target.value)}
                      className={`w-full bg-transparent border-none outline-none text-sm font-mono resize-none ${
                        line.isComment
                          ? 'text-green-600 dark:text-green-400 font-medium'
                          : line.isEmpty
                          ? 'text-gray-400 dark:text-gray-500'
                          : 'text-gray-900 dark:text-gray-100'
                      } ${
                        line.hasRanking ? 'text-blue-700 dark:text-blue-300' : ''
                      }`}
                      placeholder={line.index === lines.length - 1 ? 'Add a new task...' : ''}
                    />
                    
                    {/* Score indicator */}
                    {line.hasRanking && (
                      <div className="mt-1 flex items-center space-x-2 text-xs">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          line.rank <= Math.ceil(lines.filter(l => l.hasRanking).length / 3)
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : line.rank <= Math.ceil(lines.filter(l => l.hasRanking).length * 2 / 3)
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                          Rank {line.rank}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400">
                          Score: {line.score?.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(Editor); 