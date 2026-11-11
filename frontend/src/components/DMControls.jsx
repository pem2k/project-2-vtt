import React from 'react';
import SettingsPanel from './SettingsPanel.jsx';

/**
 * DMControls compatibility wrapper (#55).
 * Forwards to SettingsPanel with isDM={true} by default.
 */
export default function DMControls(props) {
  return <SettingsPanel isDM={true} {...props} />;
}
