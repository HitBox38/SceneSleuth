/**
 * Adds the styles for the Godot Inspector to the page
 */
export const addGodotInspectorStyles = () => {
  // Check if styles are already added
  if (document.getElementById("godot-inspector-styles")) return;

  const styleElem = document.createElement("style");
  styleElem.id = "godot-inspector-styles";
  styleElem.textContent = `
    .inspector-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #d1d5da;
      font-size: 13px;
      line-height: 1.5;
      margin-top: 0;
      margin-bottom: 16px;
    }
    
    .inspector-table th {
      text-align: left;
      padding: 8px 10px;
      background-color: #f6f8fa;
      border-bottom: 1px solid #d1d5da;
      font-weight: 600;
    }
    
    .inspector-table td {
      padding: 4px 10px;
      border-bottom: 1px solid #eaecef;
      font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
      white-space: pre-wrap;
      word-break: break-word;
    }
    
    .line-column {
      width: 50px;
    }
    
    .line-number {
      color: #6a737d;
      text-align: right;
      user-select: none;
    }
    
    .addition {
      background-color: rgba(46, 160, 67, 0.15);
    }
    
    .deletion {
      background-color: rgba(248, 81, 73, 0.15);
    }
    
    tr.addition:hover {
      background-color: rgba(46, 160, 67, 0.3);
    }
    
    tr.deletion:hover {
      background-color: rgba(248, 81, 73, 0.3);
    }
  `;

  document.head.appendChild(styleElem);
};
