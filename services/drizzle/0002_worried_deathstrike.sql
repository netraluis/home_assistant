CREATE TABLE "mqtt_devices" (
	"entity_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"mqtt_topic" text NOT NULL,
	"icon" text,
	"vendor" text,
	"model" text,
	"controllable" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mqtt_devices_mqtt_topic_unique" UNIQUE("mqtt_topic")
);
