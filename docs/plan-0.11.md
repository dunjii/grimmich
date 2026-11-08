# Plan for 0.11.0 (decided 6 Nov 2026, nothing built yet)

Status: a design discussion with clickable drafts, not code. Build only when the owner says so.

## Why

Grimmich is not only a dating tool. It is a way to turn old photo albums into findings for the family tree (Gramps):
who is this, when, where, what was the occasion. All pieces of knowledge depend on each other (a confirmed year moves
the photos in a row, a game answer narrows a span, an event sets an anchor, a series shares one year). So the interface
should not be a sequence of steps but a workspace of objects with visible cross links.

## Header

`Albums · People · Series · Events · Places | search | ● Immich ● Gramps ↻ | Game | ⚙ | Help | [Write (n)]`

- ↻ is "Refresh" (what the Inbox page does today). The dots stay a connection check.
- "Write" stays the accent button with the number of photos ready, split by target (Immich, Gramps Web).

## Start page "What makes sense now"

Replaces the Inbox as start page. Cards that link into the tabs: contradictions (warnings), series to review, photos without
year and without series, no estimate, places missing, ready to write (Immich / Gramps). Plus last refresh and counts.

## Left sidebar per tab

| Tab | Sidebar | Middle |
|---|---|---|
| Albums | albums (source albums, not the working or anchor album) | the album with page breaks |
| People | people with progress and filters | timeline or "Sort by appearance" |
| Events | events of the chosen person from Gramps | photos of the event, anchors |
| Series, Places, Game, Write | none | full width |

## Events

An event is (who, when, where); a photo is evidence for it. A photo gets candidate events from these signals:

1. People: the people on the photo (for a series: on all its photos) take part in the event, relatives included.
2. Time: the event date lies in the estimated span of the photo (one year tolerance).
3. Place (new, later): the event place matches the place of the photo.

Ranking: events with several depicted people first, then single depicted people whose time fits, then relatives.
Shown in context (detail panel, series, timeline of a person) and in the tab "Events" as a list by date with a state per
event: without photo, candidates, documented. Scope by default: people who appear on the photos and their closest
relatives (parents, children, partners), with a switch "Show all".

## Smaller changes

- After an action a line says what it changed ("Year confirmed: 3 photos moved, 1 warning less") with Undo.
  Open: today Undo exists only for the game and for writing, so it must be checked what is possible everywhere.
- Help page starts with the flow as a horizontal graphic (scan, order in Immich, read in, collect knowledge, write)
  and is opened by a "Help" button in the header, not through the settings.
- One set of line icons. Open: draw our own or take Lucide (ISC licence).

## Later (not in 0.11.0)

- Write missing event dates to Gramps (a new output with its own preview and undo).
- Places as a tab with a map showing the dated photos, across people like in Immich.
- "Who is this?" with candidates from Gramps (people alive in that year, fitting age, place, album).
- Duplicates across albums.
- Notes and places added from the phone and picked up by Grimmich (read Immich places as a hint).
- Faster game over Funnel (smaller images from outside; not measured yet).
- Copy the licence of the MiVOLO package into the image; remove `migration.py`.

## The workflow for the Help page

1. Scan the paper album.
2. In Immich: create an album that mirrors the paper album, name people, set known dates (they count as anchors when they
   differ more than 2 days from the scan date), put all photos also into the working album.
3. Refresh: Grimmich reads photos, people, dates and albums and estimates.
4. Collect knowledge in any order and as often as you like: albums (order, page breaks), people (rows by appearance),
   series, events, places, game.
5. Write: preview, test with 3 photos, then all, to Immich and to Gramps Web. Originals are backed up first.

## Update 8 Nov 2026 (evening): dev paused, 0.10.4 instead

The new person-centred interface (slice 1 "In life" on branch `dev`) was too much at once and is paused; `dev` stays as it is.
What was taken over into 0.10.4 on `main`: the menu bar (Tasks, People, Albums, Series, Events, Places), Refresh in the header,
a slimmer Inbox, an own page for one series, the basket (selection that stays across views) and rejected series suggestions
that stay away. The open question behind 0.11 remains: how to keep structure over several thousand photos from about 15 albums
(units of work are groups; every photo has one state; overviews by album and by time; a work queue sorted by what a confirmation clarifies most).
