CREATE TABLE "module_states" (
	"module_id" varchar(80) PRIMARY KEY NOT NULL,
	"version" varchar(40) NOT NULL,
	"state" varchar(20) NOT NULL,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
