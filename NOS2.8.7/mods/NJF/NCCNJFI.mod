NCCNJFI
*IDENT,NCCNJFI
*/
*/  THIS MODSET ADAPTS THE NJF INSTALLATION
*/  PROCEDURE LIBRARY TO NOS 2.8.7.
*/
*DECK,GETFILE
*D,100,118
GET,NAME=MODS871/UN=INSTALL,NA.
*D,NJ24000.1
ATTACH,NAME=OPL871/UN=INSTALL.
*D,127,129
