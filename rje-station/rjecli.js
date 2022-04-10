const fs = require("fs");
const Hasp = require("./hasp");
const process = require("process");
const readline = require("readline");

const configFile = (process.argv.length > 2) ? process.argv[2] : "config.json";
const config = JSON.parse(fs.readFileSync(configFile));
const defaults = {
  host: "localhost",
  port: 2553,
  spoolDir: "./spool"
};
for (const key of Object.keys(defaults)) {
  if (typeof config[key] === "undefined") config[key] = defaults[key];
}

let streams = {};
let timer = null;

function cli() {

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "\nOperator> "
  });

  rl.on("line", line => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    const argv = line.trim().split(" ");
    if (argv.length > 0) {
      switch (argv[0]) {
      case "lc":
      case "load_cards":
        if (argv.length > 1) {
          loadCards(1, argv[1]);
        }
        else {
          process.stdout.write("Please provide a file name\n");
        }
        break;
      case "send_command":
      case "sc":
      case "c":
        if (argv.length > 1) {
          hasp.command(argv.slice(1).join(" "));
        }
        else {
          process.stdout.write("Please provide command text\n");
        }
        break;
      case "help":
      case "?":
        displayHelp(argv);
        break;
      case "exit":
      case "quit":
      case "q":
        process.exit(0);
        break;
      case "":
        break;
      default:
        process.stdout.write("Unrecognized command\n");
        break;
      }
    }
    rl.prompt();
  });

  rl.on("close", () => {
    process.stdout.write("\nRJE CLI exiting\n");
    process.exit(0);
  });

  rl.prompt();
}

function loadCards(streamId, path) {
  try {
    const key = `CR${streamId}`;
    if (typeof streams[key] !== "undefined" && streams[key].isBusy) {
      process.stdout.write(`${key} is busy\n`);
      return;
    }
    fs.accessSync(path, fs.constants.R_OK);
    streams[key] = {};
    streams[key].path = path;
    streams[key].isBusy = true;
    process.stdout.write(`Loading ${path} on ${key} ...`);
    hasp.requestToSend(streamId);
  }
  catch (err) {
    process.stdout.write(`Failed to open ${path}: ${err}\n`);
  }
}

function displayHelp(argv) {
  const text = [
    "\nCommands:",
    "~~~~~~~~~",
    "  help : Display this help text.",
    "    alias  : ?",
    "",
    "  load_cards : Load a file containing a batch job on the card reader.",
    "    syntax : load_cards <pathname>",
    "    alias  : lc",
    "    example: lc batch.job",
    "",
    "  quit : Exit from the RJE CLI.",
    "    aliases: q, exit",
    "",
    "  send_command : Send an operator command to the RJE host.",
    "    syntax : send_command <command-text>",
    "    aliases: sc, c",
    "    example: c display,alld"
  ];
  for (const line of text)
    process.stdout.write(`${line}\n`);
}

function setPromptTimer() {
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {process.stdout.write("\nOperator> ");}, 2000);
}

process.stdout.write("\nRJE CLI starting ...");

const hasp = new Hasp(config);

hasp.on("data", (recordType, streamId, data) => {
  switch (recordType) {
  case Hasp.RecordType_OpMsg:
    process.stdout.write(`\n${data}`);
    setPromptTimer();
    break;
  case Hasp.RecordType_PrintRecord:
  case Hasp.RecordType_PunchRecord:
    const key = `${recordType === Hasp.RecordType_PrintRecord ? "LP" : "CP"}${streamId}`;
    if (typeof streams[key] === "undefined"
        || typeof streams[key].path === "undefined"
        || typeof streams[key].stream === "undefined") {
      streams[key] = {};
      const date = new Date();
      let path = `${config.spoolDir}/${key}_${date.getFullYear()}`;
      if (date.getMonth() < 9) path += "0";
      path += date.getMonth() + 1;
      if (date.getDate() < 10) path += "0";
      path += date.getDate();
      if (date.getHours() < 10) path += "0";
      path += date.getHours();
      if (date.getMinutes() < 10) path += "0";
      path += date.getMinutes();
      if (date.getSeconds() < 10) path += "0";
      path += date.getSeconds();
      const ms = date.getMilliseconds();
      if (ms < 100) path += "0";
      if (ms <  10) path += "0";
      path += `${ms}.txt`;
      streams[key].path = path;
      try {
        streams[key].stream = fs.createWriteStream(path, {encoding:"utf8",mode:"660"});
        process.stdout.write(`\nCreated ${path}`);
      }
      catch (err) {
        process.stdout.write(`\nFailed to create ${path}: ${err}`);
        return;
      }
    }
    if (data !== null) {
      streams[key].stream.write(data);
    }
    else {
      streams[key].stream.close();
      process.stdout.write(`\nClosed ${streams[key].path}`);
      setPromptTimer();
      delete streams[key];
    }
    break;
  default:
    // ignore other record types
    break;
  }
});

hasp.on("end", streamId => {
  const key = `CR${streamId}`;
  const path = streams[key].path;
  streams[key].isBusy = false;
  process.stdout.write(`\nDone    ${path} on ${key} ...`);
});

hasp.on("connect", () => {
  process.stdout.write(`\nConnected to HASP host at ${config.host}:${config.port}`);
  cli();
});

hasp.on("pti", (recordType, streamId) => {
  const key = `CR${streamId}`;
  const path = streams[key].path;
  const stream = fs.createReadStream(path);
  streams[key].stream = stream;
  process.stdout.write(`\nReading ${path} on ${key} ...`);
  hasp.send(streamId, stream);
});

hasp.start(
  (typeof config.name     !== "undefined") ? config.name     : null,
  (typeof config.password !== "undefined") ? config.password : null
);
