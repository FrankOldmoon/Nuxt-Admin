CREATE TABLE "agent_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"organization_id" integer,
	"tenant_id" integer,
	"title" varchar(200) DEFAULT '新对话' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_drafts" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"organization_id" integer,
	"tenant_id" integer,
	"capability_id" varchar(160) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"execution_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"tool_calls" jsonb,
	"ui" jsonb,
	"execution_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agent_conversations_user_updated_idx" ON "agent_conversations" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "agent_conversations_org_idx" ON "agent_conversations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "agent_drafts_conversation_status_idx" ON "agent_drafts" USING btree ("conversation_id","status");--> statement-breakpoint
CREATE INDEX "agent_drafts_user_idx" ON "agent_drafts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_messages_conversation_idx" ON "agent_messages" USING btree ("conversation_id","created_at");