import React, { useEffect, useState, useMemo, useCallback } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { gutter, GutterMarker } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
}

// Create action button gutter markers
class ActionButtonMarker extends GutterMarker {
  constructor(
    private lineIndex: number, 
    private hasRanking: boolean, 
    private onDelete: (lineIndex: number) => void,
    private onClearScore: (lineIndex: number) => void
  ) {
    super();
  }

  toDOM() {
    const container = document.createElement('div');
    container.className = 'editor-action-buttons';
    container.style.cssText = `
      display: flex; 
      align-items: center; 
      gap: 2px; 
      opacity: 0.4; 
      transition: opacity 0.2s ease;
      justify-content: flex-start;
      min-height: 20px;
    `;
    
    // Show buttons more prominently on hover
    container.addEventListener('mouseenter', () => {
      container.style.opacity = '1';
    });
    container.addEventListener('mouseleave', () => {
      container.style.opacity = '0.4';
    });
    
    // Delete button - always shown for task lines
    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = `
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    `;
    deleteBtn.style.cssText = `
      padding: 2px; 
      border-radius: 3px; 
      color: #dc2626; 
      background: rgba(239, 68, 68, 0.1); 
      border: none; 
      cursor: pointer; 
      display: flex; 
      align-items: center;
      transition: all 0.2s ease;
      width: 18px;
      height: 18px;
      justify-content: center;
    `;
    deleteBtn.title = 'Delete line';
    
    // Enhanced hover effect for delete button
    deleteBtn.addEventListener('mouseenter', () => {
      deleteBtn.style.background = 'rgba(239, 68, 68, 0.2)';
      deleteBtn.style.color = '#b91c1c';
    });
    deleteBtn.addEventListener('mouseleave', () => {
      deleteBtn.style.background = 'rgba(239, 68, 68, 0.1)';
      deleteBtn.style.color = '#dc2626';
    });
    
    deleteBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onDelete(this.lineIndex);
    };
    
    container.appendChild(deleteBtn);
    
    // Clear score button (only if line has ranking)
    if (this.hasRanking) {
      const clearBtn = document.createElement('button');
      clearBtn.innerHTML = `
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 002.828 0L18 12M3 12l6.414-6.414a2 2 0 012.828 0L18 12" />
        </svg>
      `;
      clearBtn.style.cssText = `
        padding: 2px; 
        border-radius: 3px; 
        color: #ea580c; 
        background: rgba(249, 115, 22, 0.1); 
        border: none; 
        cursor: pointer; 
        display: flex; 
        align-items: center;
        transition: all 0.2s ease;
        width: 18px;
        height: 18px;
        justify-content: center;
      `;
      clearBtn.title = 'Clear score';
      
      // Enhanced hover effect for clear button
      clearBtn.addEventListener('mouseenter', () => {
        clearBtn.style.background = 'rgba(249, 115, 22, 0.2)';
        clearBtn.style.color = '#c2410c';
      });
      clearBtn.addEventListener('mouseleave', () => {
        clearBtn.style.background = 'rgba(249, 115, 22, 0.1)';
        clearBtn.style.color = '#ea580c';
      });
      
      clearBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onClearScore(this.lineIndex);
      };
      
      container.appendChild(clearBtn);
    }
    
    return container;
  }
}

const Editor: React.FC<EditorProps> = ({ value, onChange }) => {
  const [isDarkMode, setIsDarkMode] = useState(false);

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

  // Create action gutter extension
  const actionGutter = useMemo(() => {
    return gutter({
      class: 'cm-action-gutter',
      markers: (view) => {
        const builder = new RangeSetBuilder<GutterMarker>();
        const lines = value.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          
          // Skip empty lines and comments
          if (!line || line.startsWith('#')) continue;
          
          // Check if line has ranking info
          const hasRanking = /\|\s+Rank:\s+\d+\s+\|\s+Score:\s+[-\d.]+$/.test(line);
          
          const lineStart = view.state.doc.line(i + 1).from;
          builder.add(
            lineStart,
            lineStart,
            new ActionButtonMarker(i, hasRanking, handleDeleteLine, handleClearScore)
          );
        }
        
        return builder.finish();
      },
      lineMarker: () => null,
      widgetMarker: () => null,
    });
  }, [value, handleDeleteLine, handleClearScore]);

  // Memoized extensions including the action gutter
  const extensions = useMemo(() => [
    markdown(),
    actionGutter
  ], [actionGutter]);

  // Add custom CSS for the gutter
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .cm-action-gutter {
        min-width: 50px !important;
        padding-left: 4px !important;
        padding-right: 4px !important;
        background: #fafbfc !important;
        border-right: 1px solid #e5e7eb !important;
      }
      
      .cm-editor.cm-dark .cm-action-gutter {
        background: #1f2937 !important;
        border-right: 1px solid #374151 !important;
      }
      
      .cm-line:hover .editor-action-buttons {
        opacity: 1 !important;
      }
      
      .editor-action-buttons:hover {
        opacity: 1 !important;
      }
      
      /* Ensure buttons are visible for task lines */
      .cm-action-gutter .editor-action-buttons {
        opacity: 0.4;
        transition: opacity 0.2s ease;
      }
      
      /* Make the gutter slightly wider and more prominent */
      .cm-editor .cm-gutter.cm-action-gutter {
        background: #fafbfc;
        border-right: 1px solid #e5e7eb;
        min-width: 50px;
      }
      
      .cm-editor.cm-dark .cm-gutter.cm-action-gutter {
        background: #1f2937;
        border-right: 1px solid #374151;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <div className="h-full w-full font-mono rounded-b-lg overflow-hidden">
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
    </div>
  );
};

export default React.memo(Editor); 