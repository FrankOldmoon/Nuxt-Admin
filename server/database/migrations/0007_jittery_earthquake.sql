CREATE TABLE "oauth_access_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"client_id" varchar(64) NOT NULL,
	"user_id" integer NOT NULL,
	"scope" varchar(255) DEFAULT '' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_authorization_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code_hash" varchar(128) NOT NULL,
	"client_id" varchar(64) NOT NULL,
	"user_id" integer NOT NULL,
	"redirect_uri" varchar(2000) NOT NULL,
	"scope" varchar(255) DEFAULT '' NOT NULL,
	"code_challenge" varchar(128),
	"code_challenge_method" varchar(10),
	"nonce" varchar(255),
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" varchar(64) NOT NULL,
	"client_secret_hash" varchar(128),
	"name" varchar(100) NOT NULL,
	"description" varchar(255),
	"homepage_url" varchar(500),
	"logo_url" varchar(500),
	"redirect_uris" text NOT NULL,
	"scopes" varchar(255) DEFAULT 'openid profile email' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"access_token_ttl_minutes" integer DEFAULT 60 NOT NULL,
	"refresh_token_ttl_days" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "oauth_refresh_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"client_id" varchar(64) NOT NULL,
	"user_id" integer NOT NULL,
	"scope" varchar(255) DEFAULT '' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_access_tokens_token_hash_idx" ON "oauth_access_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "oauth_access_tokens_user_idx" ON "oauth_access_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_authorization_codes_code_hash_idx" ON "oauth_authorization_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "oauth_authorization_codes_user_idx" ON "oauth_authorization_codes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_clients_client_id_idx" ON "oauth_clients" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_refresh_tokens_token_hash_idx" ON "oauth_refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "oauth_refresh_tokens_user_idx" ON "oauth_refresh_tokens" USING btree ("user_id");