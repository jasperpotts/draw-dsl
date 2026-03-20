/**
 * Exhaustive DSL fixture strings for round-trip testing.
 * Each fixture isolates a specific DSL feature for precise failure diagnosis.
 */

/** All 16 shape keywords with positions */
export const ALL_SHAPES = `\
box S1 "Box" @10,10
rbox S2 "Rounded Box" @150,10
diamond S3 "Diamond" @290,10
circle S4 "Circle" @430,10
ellipse S5 "Ellipse" @10,120
cylinder S6 "Cylinder" @150,120
cloud S7 "Cloud" @290,120
parallelogram S8 "Parallelogram" @430,120
hexagon S9 "Hexagon" @10,230
trapezoid S10 "Trapezoid" @150,230
triangle S11 "Triangle" @290,230
note S12 "Note" @430,230
document S13 "Document" @10,340
person S14 "Person" @150,340
step S15 "Step" @290,340
card S16 "Card" @430,340`;

/** Basic arrow operators: ->, -->, --, --- */
export const ALL_ARROWS_BASIC = `\
box A "A" @10,10
box B "B" @200,10
box C "C" @10,120
box D "D" @200,120
box E "E" @10,230
box F "F" @200,230
box G "G" @10,340
box H "H" @200,340
A -> B
C --> D
E -- F
G --- H`;

/** Bidirectional arrows: <->, <--> */
export const ALL_ARROWS_BIDI = `\
box A "A" @10,10
box B "B" @200,10
box C "C" @10,120
box D "D" @200,120
A <-> B
C <--> D`;

/** UML arrows: *->, o->, #->, ~->, +-> */
export const ALL_ARROWS_UML = `\
box A "A" @10,10
box B "B" @200,10
box C "C" @10,120
box D "D" @200,120
box E "E" @10,230
box F "F" @200,230
box G "G" @10,340
box H "H" @200,340
box I "I" @10,450
box J "J" @200,450
A *-> B
C o-> D
E #-> F
G ~-> H
I +-> J`;

/** Terminal markers: ->-x, ->-o */
export const TERMINAL_MARKERS = `\
box A "A" @10,10
box B "B" @200,10
box C "C" @10,120
box D "D" @200,120
A ->-x B
C ->-o D`;

/** All 10 color tokens on shapes */
export const ALL_COLORS = `\
box S0 "Color 0" @10,10 c=c0
box S1 "Color 1" @10,90 c=c1
box S2 "Color 2" @10,170 c=c2
box S3 "Color 3" @10,250 c=c3
box S4 "Color 4" @10,330 c=c4
box S5 "Color 5" @10,410 c=c5
box S6 "Color 6" @10,490 c=c6
box S7 "Color 7" @10,570 c=c7
box S8 "Color 8" @10,650 c=c8
box S9 "Color 9" @10,730 c=c9`;

/** Heading text classes: h1, h2, h3, h4 */
export const TEXT_CLASSES_HEADINGS = `\
box S1 "Heading 1" @10,10 text=h1
box S2 "Heading 2" @10,90 text=h2
box S3 "Heading 3" @10,170 text=h3
box S4 "Heading 4" @10,250 text=h4`;

/** Body text classes: b1, b2, b3, b4, b5, b6 */
export const TEXT_CLASSES_BODY = `\
box S1 "Body 1" @10,10 text=b1
box S2 "Body 2" @10,90 text=b2
box S4 "Body 4" @10,170 text=b4
box S5 "Body 5" @10,250 text=b5
box S6 "Body 6" @10,330 text=b6`;

/** Connection text classes: ct1, ct2 */
export const TEXT_CLASSES_CONN = `\
box A "A" @10,10
box B "B" @200,10
box C "C" @10,120
box D "D" @200,120
A -> B "label1"
C -> D "label2" text=ct2`;

/** Mono text modifier */
export const TEXT_CLASS_MONO = `\
box S1 "Mono Text" @10,10 text=b2,mono`;

/** Route types: straight, curved, elbow, er, iso (ortho is default/elided) */
export const ROUTE_TYPES = `\
box A "A" @10,10
box B "B" @200,10
box C "C" @10,120
box D "D" @200,120
box E "E" @10,230
box F "F" @200,230
box G "G" @10,340
box H "H" @200,340
box I "I" @10,450
box J "J" @200,450
A -> B route=straight
C -> D route=curved
E -> F route=elbow
G -> H route=er
I -> J route=iso`;

/** Importance levels: imp=1, imp=2 (imp=3 is default/elided) */
export const IMPORTANCE_LEVELS = `\
box A "A" @10,10
box B "B" @200,10
box C "C" @10,120
box D "D" @200,120
A -> B imp=1
C -> D imp=2`;

/** Groups: parent shape + children with in=GROUP */
export const GROUPS = `\
box GROUP "Group Container" @50,50 [300x200]
box CHILD1 "Child 1" @70,80 in=GROUP
box CHILD2 "Child 2" @70,160 in=GROUP
CHILD1 -> CHILD2`;

/** Waypoints on connections */
export const WAYPOINTS = `\
box A "A" @10,10
box B "B" @300,200
A -> B via 150,10 150,200`;

/** Text elements */
export const TEXT_ELEMENTS = `\
text T1 "Hello World" @100,50
text T2 "Colored" @100,100 c=c0
text T3 "Styled" @100,150 text=h2`;

/** Size overrides (non-default) */
export const SIZE_OVERRIDES = `\
box S1 "Wide Box" @10,10 [200x60]
box S2 "Tall Box" @10,90 [120x120]
circle S3 "Big Circle" @10,230 [100x100]`;

/** Multiline labels */
export const MULTILINE_LABELS = `\
box S1 "Line One\\nLine Two" @10,10
box S2 "A\\nB\\nC" @10,100`;

/** Diagram title */
export const DIAGRAM_TITLE = `\
diagram "My Test Diagram"

box S1 "Hello" @10,10`;

/** Connection with label + color + text class combined */
export const CONNECTION_ATTRS = `\
box A "Source" @10,10
box B "Target" @200,10
A -> B "flows to" c=c1 text=ct2`;

/** Comprehensive fixture combining all features */
export const COMPREHENSIVE = `\
diagram "Comprehensive Test"

box PARENT "Parent Group" @50,50 [400x300] c=c0 text=h2
box CHILD1 "Child A" @80,100 c=c1 in=PARENT
circle CHILD2 "Child B" @80,200 c=c3 in=PARENT
diamond D1 "Decision" @500,100 c=c4 text=h3
rbox R1 "Rounded" @500,250 [150x80] c=c5
text T1 "Title Text" @250,10 c=c0 text=h1
CHILD1 -> CHILD2 "internal" c=c2
CHILD1 -> D1 "check" imp=1 route=straight
D1 -> R1 "yes" c=c1 text=ct2
D1 -->-x PARENT "no"
R1 <-> CHILD2 via 400,350`;
