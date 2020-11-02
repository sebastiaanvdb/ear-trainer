import musicalbeeps
from random import sample
import constants

class Intervals:
    def __init__(self):
        self.player = musicalbeeps.Player(volume=0.3,
                                     mute_output=False)

    def play_note(self, note: str):
        self.player.play_note(note, 1)

    def play_pause(self, pause_duration: float):
        self.player.play_note("pause", pause_duration)

    def get_random_interval(self):
        return sample(range(1,13), 1)[0]


    def exercise(self):
        self.play_note(constants.low_limit)
        self.play_pause(2)
        current_note = 0
        up = True
        for i in range(20):
            if up:
                current_note = current_note + self.get_random_interval()
                print("up")
                if current_note > 36:
                    print("to high")
                    current_note = current_note - self.get_random_interval()
                    up = False
            elif not up:
                print("going down")
                current_note = current_note - self.get_random_interval()
                if current_note < 0:
                    print("to low")
                    current_note = current_note + self.get_random_interval()
                    up = True
            self.play_note(constants.notes[current_note])
            self.play_pause(2)
if __name__ == '__main__':
    intervals = Intervals()
    intervals.exercise()
