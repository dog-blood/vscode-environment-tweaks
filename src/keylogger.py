import keyboard
import sys

def is_ctrl_e_pressed():
    return keyboard.is_pressed('ctrl') and keyboard.is_pressed('e')

def on_key_event(event):
    try:
        if event.event_type == 'down' and is_ctrl_e_pressed():
            if event.name == 'right':
                print('COMMAND:right', flush=True)
                sys.stdout.flush()
            elif event.name == 'left':
                print('COMMAND:left', flush=True)
                sys.stdout.flush()
    except Exception as e:
        print(f"ERROR: {str(e)}", flush=True)
        sys.stdout.flush()

keyboard.hook(on_key_event)
keyboard.wait() 