CREATE TABLE "agent_approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" varchar(64) NOT NULL,
	"execution_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"tenant_id" integer,
	"organization_id" integer,
	"calls" jsonb NOT NULL,
	"arguments_hash" varchar(64) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone,
	"decided_by" integer,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_artifacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"execution_id" integer NOT NULL,
	"file_id" integer NOT NULL,
	"kind" varchar(40),
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_executions" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" varchar(80) DEFAULT 'agent' NOT NULL,
	"user_id" integer NOT NULL,
	"tenant_id" integer,
	"organization_id" integer,
	"session_id" varchar(120),
	"task_id" varchar(120),
	"model_id" varchar(120),
	"provider_id" varchar(80),
	"status" varchar(30) DEFAULT 'running' NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_tokens" integer,
	"cost_usd" double precision,
	"error" text,
	"metadata" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_tool_calls" (
	"id" serial PRIMARY KEY NOT NULL,
	"execution_id" integer NOT NULL,
	"module_id" varchar(80),
	"tool_id" varchar(160) NOT NULL,
	"call_id" varchar(160) NOT NULL,
	"status" varchar(20) NOT NULL,
	"risk_level" varchar(20),
	"arguments" jsonb,
	"result_size" integer,
	"duration_ms" integer,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_approvals_batch_idx" ON "agent_approvals" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "agent_approvals_user_status_idx" ON "agent_approvals" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_artifacts_execution_file_idx" ON "agent_artifacts" USING btree ("execution_id","file_id");--> statement-breakpoint
CREATE INDEX "agent_artifacts_execution_idx" ON "agent_artifacts" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "agent_executions_user_started_idx" ON "agent_executions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "agent_executions_org_started_idx" ON "agent_executions" USING btree ("organization_id","started_at");--> statement-breakpoint
CREATE INDEX "agent_executions_status_idx" ON "agent_executions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_tool_calls_execution_idx" ON "agent_tool_calls" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "agent_tool_calls_tool_idx" ON "agent_tool_calls" USING btree ("tool_id");