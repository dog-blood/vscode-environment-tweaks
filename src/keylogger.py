import keyboard
import sys
import os
from datetime import datetime

# Create a debug log file in the extension directory
DEBUG_LOG = os.path.join(os.path.dirname(__file__), 'keylogger_debug.log')

def log_debug(message):
    try:
        with open(DEBUG_LOG, 'a') as f:
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')
            f.write(f'[{timestamp}] {message}\n')
    except Exception as e:
        print(f"ERROR writing to debug log: {str(e)}", flush=True)

def is_ctrl_e_pressed():
    ctrl = keyboard.is_pressed('ctrl')
    e = keyboard.is_pressed('e')
    log_debug(f'Checking keys - Ctrl: {ctrl}, E: {e}')
    return ctrl and e

def on_key_event(event):
    try:
        log_debug(f'Key event: {event.name} ({event.event_type})')
        
        if event.event_type == 'down':
            log_debug('Checking Ctrl+E combination...')
            if is_ctrl_e_pressed():
                log_debug('Ctrl+E is pressed!')
                
                if event.name == 'right':
                    log_debug('RIGHT arrow detected - sending command')
                    print('COMMAND:right', flush=True)
                    sys.stdout.flush()
                elif event.name == 'left':
                    log_debug('LEFT arrow detected - sending command')
                    print('COMMAND:left', flush=True)
                    sys.stdout.flush()
                
    except Exception as e:
        error_msg = f"ERROR: {str(e)}"
        log_debug(error_msg)
        print(error_msg, flush=True)
        sys.stdout.flush()

# Log startup with more info
log_debug('=== Keylogger Starting ===')
log_debug(f'Script location: {__file__}')
log_debug(f'Log file location: {DEBUG_LOG}')
print('Python keylogger started', flush=True)
sys.stdout.flush()

# Register handler
keyboard.hook(on_key_event)
log_debug('Keyboard hook registered')

# Keep script running
log_debug('Entering wait loop')
keyboard.wait()