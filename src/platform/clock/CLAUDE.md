# clock

The `Clock` port: the one seam onto wall-clock time. Domain code takes
dates/times as parameters — this is what services and entrypoints read them
from, so a test controls "now" via a fake instead of the real clock.

`today`/`timeHHMM` read the system's **local** calendar day and clock, not
UTC — they fill the worklog entry template's date and `{time}` fields.
