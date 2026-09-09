CREATE TABLE "sensor_data" (
	"id" serial PRIMARY KEY NOT NULL,
	"sensor_id" text NOT NULL,
	"type" text NOT NULL,
	"metric" text,
	"value" double precision,
	"unit" text,
	"timestamp" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "sensor_data_sensor_id_timestamp_idx" ON "sensor_data" USING btree ("sensor_id","timestamp" DESC NULLS LAST);