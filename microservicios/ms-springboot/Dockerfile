# --- Build stage ---
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /workspace

# Cache de dependencias
COPY pom.xml .
RUN mvn dependency:go-offline -B

# Copiar codigo fuente
COPY src ./src

RUN mvn clean package -DskipTests -B

# --- Runtime stage ---
FROM eclipse-temurin:17-jre-jammy
WORKDIR /app
COPY --from=build /workspace/target/ms-gestion-*.jar app.jar

EXPOSE 8080
ENV SPRING_PROFILES_ACTIVE=prod
ENTRYPOINT ["java", "-jar", "app.jar"]
