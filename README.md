## File structure

The installation has subdirectories as follows:
* `audio` contains audio samples
* `css` contains style sheets
* `dictionaries` contains all the dictionaries
* `editions` contains the edition specifications
* `games` contains the database of games
* `html` has the html for the user interfaces, `games.html` for the control panel, `createGame.html` for the new game page, and `game.html` for the game itself.
* `i18n` contains the master English `en.json` and any other contributed translations of the interface.
* `images` contains images used by the game
* `js` has all the source code
	* `js/browser` is the browser code
	* `js/dawg` is generation and management of DAWGs
	* `js/design` is the Valett program
	* `js/game` has the platform-independent game engine
	* `js/i18n` has the translations checker
	* `js/server` has the server code

## Building your own dictionary

Dictionaries are stored in the `dictionaries` directory in the form of
a DAWG (Directed Acyclic Word Graph), which is generated from a
lexicon (list of words) using a processor based on [Daniel Weck's
DAWG_Compressor program](https://github.com/danielweck/scrabble-html-ui). To build a new dictionary, follow the
instructions given when you run:
```
$ node js/dawg/compressor.js
```
`js/dawg/explore.js` can be used to explore the generated DAWG(s) e.g.
```
$ node js/dawg/explore.js SOWPODS_English --anagrams scrabble
```
Run it with no parameters for help.

## Internationalisation
The UI uses the [Wikimedia jQuery.i18n framework](https://github.com/wikimedia/jquery.i18n) to support translations. Currently translation files are provided for English, (une très mauvaise traduction en) French, and (eine schlechte Übersetzung ins) German. To generate your own translation (or improve on Google's), copy `/i18n/en.json` to a file using your language code (e.g. `it` for Italian) and edit the new file to provide the translation. You can use the `bin/checkStrings.pl` Perl program to check the completeness of your translations.

## Challenges
Currently only [double challenge](https://en.wikipedia.org/wiki/Challenge_(Scrabble)) is supported. An extension would be to support other challenge types.

## Flow of Control

A game is joined by opening a server URI which identifies the game
and player (`GET /game/gameKey/playerKey`) that this Ui will play. 

The response to this request includes a cookie that identifies the
gameKey and playerKey for future requests, and redirects to
`/game/gameKey`. The handler for this request recognises that the
browser is asking for HTML and serves up `/html/game.html`, which
loads the UI. When the document is ready, it executes `/js/game.js`,
which instantiates an object of the `Ui` class after URL parameters
have been analysed by the helper `js/browser/browserApp.js`.

Construction of the Ui object asks the server for the state of the
game using a `GET /game/gameKey` URI. The server recognises this as a
request for JSON, and serves up the game, as serialised by
`js/game/Freeze.js`.  The UI thaws this data and loads the game, then
manually connects the `WebSocket`, attaching handlers for managing the
socket (see Ui.attachSocketListeners).  These include handlers
for custom events `turn`, `tick`, `gameOverConfimed`, `nextGame`,
`message`, and `connections`, that the server will send. With the
exception of `message` these are all broadcast events, sent to all
players.
 
Once construction is complete, the Ui will listen for events coming
from the server and modify the Ui accordingly. It will also listen
for events coming from the user. At points it will POST messages to the
server to reflect user actions: `makeMove`, `challenge`,
`swap`, `takeBack`, and `pass`. The server will pass these on to
`js/game/Game.js` for handling.

## Testing
The `test` subdirectoy contains a number of simple tests. They are all run in that directory using `node`.
* `Game.js` is a set of unit tests for the game logic
* `findBestMove.js` is unit tests for the robot player
* `firstPlay.js` is unit tests for the first play by a robot player
* `Fridge.js` is unit tests for the freeze/thaw code
* `playARobotGame.js` will play a (random) game between two robots

## Documentation

The code is documented using `jsdoc`. The documentation is automatically
built when a new version is pushed to github, and can be found on <a href="https://cdot.github.io/CrosswordGame/">github pages</a>.

For development, the `Makefile` at the root has a
`doc` target that will generate the documentation in the `doc` subdirectory.
You can read the doc in a browser by opening `file:///..../doc/index.html`
or, if the game server is running, by loading `http://localhost:9093/doc/index.html` (adjust URL to suit your install)

## Docker
`Dockerfile` can be used for building local docker images. For example,
```
$ docker build . --tag xword
```
will build an image using `Dockerfile`
```
$ docker run -p9093:9093 xword
```
will run the image, mapping `localhost` port 9093 to port 9093 on the docker image

## Ideas

The github repository has a list of issues that need to be addressed, including
a number of enhancements. Here are some other enhancements that you might like
to explore.

### Designing your own game
Game definitions can be found in the `/editions` directory. Each
definition describes the layout of the lower-right quadrant of the
board (it is assumed to be mirrored), the contents of the bag, the
number of tiles on the rack, the number of tiles that can be swapped
in a play, and the bonuses for playing certain numbers of tiles in one
play.

### Valett
Choosing point values for tiles, and the number of tiles of each letter,
can be difficult to get right. Included is a version of
[Joshua Lewis' Valett program](https://github.com/jmlewis/valett)
which analyses a word corpus and recommends tile values and counts for the
letter combinations encountered in the corpus based on probability (the corpus
can be any big list of words, or it can simply be a lexicon). Run the program
`node js/design/valett.js` for help.

### DAWG
The DAWG support is designed to be reusable in other games. It might be fun to implement Wordle, for example, or the word search game often found in newspapers where you try to make as many words as possible from a 9 letter anagram. The `js/dawg/explore.js` is a basic command-line tool for exploring a DAWG.

### Public Server
It would be nice to see a truly public server that anyone could sign in to and play against other random people. However this would have to be done with great care.

- there are already a number of security features, such as simple XSS avoidance (thanks to @pkolano) and use of HTTPS, but it has some potential holes that might be exploited by an evil person. An audit it required.
- would also have to address things like the size and performance of the database, and the performance of the robot.
- the games interface would be unusable without some sort of grouping of users and/or games - for example, into "rooms".
