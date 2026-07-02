const { runPendingMigrations } = require("../src/config/runMigrations");
runPendingMigrations()
  .then(() => {
    console.log("All migrations completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration failed:", error.message);
    process.exit(1);
  });
