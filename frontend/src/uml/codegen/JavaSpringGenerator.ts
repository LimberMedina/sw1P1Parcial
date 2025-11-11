// src/uml/codegen/JavaSpringGenerator.ts

export interface ClassDefinition {
  name: string;
  attributes: string[]; // acepta "nombre: Tipo" | "Tipo nombre" | "nombre"
  methods: string[]; // no usado aquí, pero se mantiene para futuro
}

export interface RelationDefinition {
  source: string; // clase origen
  target: string; // clase destino
  type: "ONE_TO_ONE" | "ONE_TO_MANY" | "MANY_TO_ONE" | "MANY_TO_MANY";
  bidirectional: boolean;
  // opcionales (si los pasas desde el front, no molestan)
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
  name?: string;
  navigationProperty?: string;
}

// Tipos internos mejorados para procesamiento
interface ProcessedRelation {
  source: string;
  target: string;
  type: "ONE_TO_ONE" | "ONE_TO_MANY" | "MANY_TO_ONE" | "MANY_TO_MANY";
  bidirectional: boolean;
  ownerSide: "source" | "target"; // Quién tiene la FK
  name?: string;
}

type ParsedAttr = { type: string; name: string };

export class JavaSpringGenerator {
  private classes: ClassDefinition[] = [];
  private relations: RelationDefinition[] = [];
  private processedRelations: ProcessedRelation[] = [];
  private packageName: string;

  constructor(packageName: string = "com.example") {
    this.packageName = packageName;
  }

  addClass(cls: ClassDefinition) {
    this.classes.push(cls);
  }

  addRelation(relation: RelationDefinition) {
    this.relations.push(relation);
  }

  /**
   * Analiza las multiplicidades para determinar el tipo exacto de relación
   * y quién debe tener la llave foránea
   */
  private analyzeMultiplicity(multStr: string): {
    isMany: boolean;
    isOptional: boolean;
  } {
    const cleaned = (multStr || "").trim();

    // Patrones comunes: 1, 0..1, 1..1, 1..*, 0..*, *, n, N, many
    const isManyPattern = /\*|n|N|many|\.\.(\*|n|N)|(\d+)\.\.\*/i.test(cleaned);
    const isOptionalPattern = /^0\.\./i.test(cleaned);

    return {
      isMany: isManyPattern,
      isOptional: isOptionalPattern,
    };
  }

  /**
   * Procesa todas las relaciones y determina correctamente los tipos
   * basándose en las multiplicidades
   */
  private processRelations() {
    this.processedRelations = [];

    this.relations.forEach((rel) => {
      const srcMult = this.analyzeMultiplicity(rel.sourceMultiplicity || "");
      const tgtMult = this.analyzeMultiplicity(rel.targetMultiplicity || "");

      let type: "ONE_TO_ONE" | "ONE_TO_MANY" | "MANY_TO_ONE" | "MANY_TO_MANY";
      let ownerSide: "source" | "target";

      // Determinar tipo de relación según cardinalidades
      if (srcMult.isMany && tgtMult.isMany) {
        // *..* → MANY_TO_MANY
        type = "MANY_TO_MANY";
        ownerSide = "source"; // Por convención, source crea la tabla intermedia
      } else if (srcMult.isMany && !tgtMult.isMany) {
        // *..1 → MANY_TO_ONE (muchos source → un target)
        // FK debe estar en SOURCE
        type = "MANY_TO_ONE";
        ownerSide = "source";
      } else if (!srcMult.isMany && tgtMult.isMany) {
        // 1..* → ONE_TO_MANY (un source → muchos target)
        // FK debe estar en TARGET
        type = "ONE_TO_MANY";
        ownerSide = "target";
      } else {
        // 1..1 → ONE_TO_ONE
        type = "ONE_TO_ONE";
        // Por convención, el lado source tiene la FK
        ownerSide = "source";
      }

      this.processedRelations.push({
        source: rel.source,
        target: rel.target,
        type,
        bidirectional: rel.bidirectional,
        ownerSide,
        name: rel.name,
      });
    });
  }

  // ===== Utils =====
  private safeStr(s: unknown, fallback = ""): string {
    const v = String(s ?? "").trim();
    return v || fallback;
  }

  private toCamelCase(str: string): string {
    const s = this.safeStr(str);
    if (!s) return "value";
    const out = s.charAt(0).toLowerCase() + s.slice(1);
    const reserved = [
      "class",
      "interface",
      "abstract",
      "public",
      "private",
      "protected",
      "static",
      "final",
      "volatile",
      "transient",
      "synchronized",
      "native",
      "strictfp",
    ];
    return reserved.includes(out) ? `${out}Entity` : out;
  }

  private toPascal(str: string): string {
    const s = this.safeStr(str);
    if (!s) return "Value";
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  private toPlural(str: string): string {
    const s = this.safeStr(str);
    if (!s) return "items";
    if (/(s|sh|ch|x|z)$/.test(s)) return s + "es";
    if (/[^aeiou]y$/.test(s)) return s.slice(0, -1) + "ies";
    if (s.endsWith("f")) return s.slice(0, -1) + "ves";
    if (s.endsWith("fe")) return s.slice(0, -2) + "ves";
    return s + "s";
  }

  private sanitizeIdentifier(raw: string, fallback: string): string {
    let s = this.safeStr(raw, fallback).replace(/[^\p{L}\p{N}_$]/gu, "_");
    if (/^\d/.test(s)) s = "_" + s;
    return s;
  }

  private isJavaType(token: string): boolean {
    const t = token.trim();
    const primitives = [
      "int",
      "long",
      "double",
      "float",
      "boolean",
      "byte",
      "short",
      "char",
      "void",
    ];
    const common = [
      "String",
      "Integer",
      "Long",
      "Double",
      "Float",
      "Boolean",
      "BigDecimal",
      "Date",
      "LocalDate",
      "LocalDateTime",
      "UUID",
    ];
    return primitives.includes(t) || common.includes(t) || /^[A-Z]\w*$/.test(t);
  }

  /** Acepta: "nombre: Tipo" | "Tipo nombre" | "nombre" */
  private parseAttribute(line: string, index: number): ParsedAttr {
    const raw = this.safeStr(line);
    if (!raw) return { type: "String", name: `field_${index + 1}` };

    // 1) "nombre: Tipo"
    const colonIdx = raw.indexOf(":");
    if (colonIdx !== -1) {
      let name = this.sanitizeIdentifier(
        raw.slice(0, colonIdx).trim(),
        `field_${index + 1}`
      );
      let type = this.safeStr(raw.slice(colonIdx + 1), "String").trim();

      // ✅ MAPEAR TIPOS A JAVA VÁLIDOS
      type = this.mapToJavaType(type);

      // ✅ NORMALIZAR NOMBRE
      name = this.toCamelCase(name);

      return { type, name };
    }

    // 2) "Tipo nombre"
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length === 2 && this.isJavaType(parts[0])) {
      let type = this.mapToJavaType(parts[0]);
      let name = this.sanitizeIdentifier(parts[1], `field_${index + 1}`);
      name = this.toCamelCase(name);
      return { type, name };
    }

    // 3) "nombre" => String
    let name = this.sanitizeIdentifier(raw, `field_${index + 1}`);
    name = this.toCamelCase(name);
    return { type: "String", name };
  }

  // ✅ AGREGAR método para mapear tipos:
  private mapToJavaType(type: string): string {
    const typeMap: Record<string, string> = {
      // Tipos comunes del diagrama -> Java
      int: "Integer",
      Int: "Integer",
      integer: "Integer",
      Integer: "Integer",

      long: "Long",
      Long: "Long",

      string: "String",
      String: "String",
      text: "String",
      Text: "String",

      double: "Double",
      Double: "Double",
      float: "Float",
      Float: "Float",

      decimal: "BigDecimal",
      Decimal: "BigDecimal",
      money: "BigDecimal",
      currency: "BigDecimal",

      bool: "Boolean",
      Bool: "Boolean",
      boolean: "Boolean",
      Boolean: "Boolean",

      date: "LocalDate",
      Date: "LocalDate",
      datetime: "LocalDateTime",
      DateTime: "LocalDateTime",
      timestamp: "LocalDateTime",

      uuid: "UUID",
      UUID: "UUID",
      guid: "UUID",
    };

    const normalized = type.trim();
    return typeMap[normalized] || "String"; // Default a String si no se encuentra
  }

  // ====== Code gen ======
  private generateImports() {
    return `package ${this.packageName}.model;

import jakarta.persistence.*;
import lombok.*;
import java.util.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;
import com.fasterxml.jackson.annotation.*;

`;
  }

  private generateFields(cls: ClassDefinition): string {
    const lines: string[] = [];
    const usedFieldNames = new Set<string>();

    // ✅ RESERVAR 'id' desde el inicio
    usedFieldNames.add("id");

    // Procesar atributos simples
    cls.attributes.forEach((a, i) => {
      const { type, name } = this.parseAttribute(a, i);

      // ✅ EVITAR DUPLICAR 'id' y nombres repetidos
      if (!usedFieldNames.has(name) && name.toLowerCase() !== "id") {
        usedFieldNames.add(name);
        lines.push(
          `    @Column(name = "${name.toLowerCase()}")
    private ${type} ${name};`
        );
      }
    });

    // ✅ PROCESAR RELACIONES USANDO processedRelations
    const className = cls.name;

    this.processedRelations
      .filter((r) => r.source === className || r.target === className)
      .forEach((r) => {
        const isSource = r.source === className;
        const otherClass = isSource ? r.target : r.source;
        const otherVar = this.toCamelCase(otherClass);
        const collNameFromOther = this.toPlural(otherVar);

        // Determinar el nombre del campo
        let relationFieldName: string;

        switch (r.type) {
          case "ONE_TO_ONE":
            relationFieldName = otherVar;
            break;
          case "MANY_TO_ONE":
            relationFieldName = otherVar; // Siempre singular
            break;
          case "ONE_TO_MANY":
            relationFieldName = isSource ? collNameFromOther : otherVar;
            break;
          case "MANY_TO_MANY":
            relationFieldName = collNameFromOther; // Siempre plural
            break;
          default:
            relationFieldName = otherVar;
        }

        // ✅ EVITAR RELACIONES DUPLICADAS
        if (usedFieldNames.has(relationFieldName)) {
          return; // Saltar si ya existe
        }
        usedFieldNames.add(relationFieldName);

        // ✅ GENERAR ANOTACIONES SEGÚN EL TIPO Y EL LADO PROPIETARIO
        switch (r.type) {
          case "ONE_TO_ONE": {
            if (
              (isSource && r.ownerSide === "source") ||
              (!isSource && r.ownerSide === "target")
            ) {
              // Este lado tiene la FK
              lines.push(
                `    @OneToOne(cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @JoinColumn(name = "${otherVar}_id")
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private ${otherClass} ${otherVar};`
              );
            } else if (r.bidirectional) {
              // Lado inverso (mappedBy)
              const mappedByField = this.toCamelCase(className);
              lines.push(
                `    @OneToOne(mappedBy = "${mappedByField}", fetch = FetchType.LAZY)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private ${otherClass} ${otherVar};`
              );
            }
            break;
          }

          case "MANY_TO_ONE": {
            if (
              (isSource && r.ownerSide === "source") ||
              (!isSource && r.ownerSide === "target")
            ) {
              // Este lado tiene la FK (el lado "muchos")
              lines.push(
                `    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "${otherVar}_id")
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private ${otherClass} ${otherVar};`
              );
            } else if (r.bidirectional) {
              // Lado inverso OneToMany
              const mappedByField = this.toCamelCase(className);
              lines.push(
                `    @OneToMany(mappedBy = "${mappedByField}", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private Set<${otherClass}> ${collNameFromOther} = new HashSet<>();`
              );
            }
            break;
          }

          case "ONE_TO_MANY": {
            if (
              (isSource && r.ownerSide === "source") ||
              (!isSource && r.ownerSide === "target")
            ) {
              // Este lado tiene la FK (el lado "muchos")
              const targetVar = this.toCamelCase(
                isSource ? r.target : r.source
              );
              lines.push(
                `    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "${targetVar}_id")
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private ${otherClass} ${otherVar};`
              );
            } else {
              // Lado inverso OneToMany (colección)
              const mappedByField = this.toCamelCase(className);
              lines.push(
                `    @OneToMany(mappedBy = "${mappedByField}", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private Set<${otherClass}> ${collNameFromOther} = new HashSet<>();`
              );
            }
            break;
          }

          case "MANY_TO_MANY": {
            if (
              (isSource && r.ownerSide === "source") ||
              (!isSource && r.ownerSide === "target")
            ) {
              // Este lado crea la tabla intermedia
              const joinTable = `${className.toLowerCase()}_${otherClass.toLowerCase()}`;
              lines.push(
                `    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
        name = "${joinTable}",
        joinColumns = @JoinColumn(name = "${this.toCamelCase(className)}_id"),
        inverseJoinColumns = @JoinColumn(name = "${this.toCamelCase(
          otherClass
        )}_id")
    )
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private Set<${otherClass}> ${collNameFromOther} = new HashSet<>();`
              );
            } else if (r.bidirectional) {
              // Lado inverso (mappedBy)
              const mappedByField = this.toPlural(this.toCamelCase(className));
              lines.push(
                `    @ManyToMany(mappedBy = "${mappedByField}", fetch = FetchType.LAZY)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private Set<${otherClass}> ${collNameFromOther} = new HashSet<>();`
              );
            }
            break;
          }
        }
      });

    return lines.filter(Boolean).join("\n\n");
  }

  private generateClass(cls: ClassDefinition): string {
    const className = this.toPascal(cls.name);
    const varName = this.toCamelCase(className);
    const body = this.generateFields(cls);

    return `${this.generateImports()}
@Entity
@Table(name = "${this.toPlural(className.toLowerCase())}")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ${className} {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

${body ? "\n" + body + "\n" : ""}

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        ${className} ${varName} = (${className}) o;
        return Objects.equals(id, ${varName}.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }

    @Override
    public String toString() {
        return "${className}{id=" + id + "}";
    }
}`;
  }

  generateAll(): Record<string, string> {
    // ✅ PROCESAR RELACIONES ANTES DE GENERAR CLASES
    this.processRelations();

    const result: Record<string, string> = {};

    result["pom.xml"] = this.generatePomXml();
    result["src/main/resources/application.properties"] =
      this.generateApplicationProperties();
    result["src/main/java/com/example/Application.java"] =
      this.generateMainApplication();
    result["src/main/java/com/example/config/ModelMapperConfig.java"] =
      this.generateModelMapperConfig();
    result["src/main/java/com/example/config/CorsConfig.java"] =
      this.generateCorsConfig();
    result["README.md"] = this.generateReadme();
    result["database/setup.sql"] = this.generateDatabaseSetupScript();
    result["database/README.md"] = this.generateDatabaseReadme();

    // Entidades con rutas completas
    this.classes.forEach((cls) => {
      const className = this.toPascal(cls.name);
      result[`src/main/java/com/example/model/${className}.java`] =
        this.generateClass(cls);
      result[`src/main/java/com/example/dto/${className}DTO.java`] =
        this.generateDTO(cls);
      result[
        `src/main/java/com/example/repository/${className}Repository.java`
      ] = this.generateRepository(cls);
      result[`src/main/java/com/example/service/${className}Service.java`] =
        this.generateService(cls);
      result[
        `src/main/java/com/example/controller/${className}Controller.java`
      ] = this.generateController(cls);
    });

    result["POSTMAN_TESTS.md"] = this.generatePostmanTestsGuide();

    return result;
  }

  private generatePomXml(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.0</version>
        <relativePath/>
    </parent>
    
    <groupId>com.example</groupId>
    <artifactId>spring-boot-project</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    <name>Generated Spring Boot Project</name>
    
    <properties>
        <java.version>17</java.version>
    </properties>
    
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
        
        <!-- PostgreSQL Driver -->
        <dependency>
            <groupId>org.postgresql</groupId>
            <artifactId>postgresql</artifactId>
            <scope>runtime</scope>
        </dependency>
        
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>
        <dependency>
            <groupId>org.modelmapper</groupId>
            <artifactId>modelmapper</artifactId>
            <version>3.1.1</version>
        </dependency>
    </dependencies>
    
    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
                <configuration>
                    <excludes>
                        <exclude>
                            <groupId>org.projectlombok</groupId>
                            <artifactId>lombok</artifactId>
                        </exclude>
                    </excludes>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>`;
  }

  private generateApplicationProperties(): string {
    return `# ============================================
# CONFIGURACIÓN DE BASE DE DATOS POSTGRESQL
# ============================================

# Conexión a PostgreSQL
spring.datasource.url=jdbc:postgresql://localhost:5432/uml_crud_db
spring.datasource.driver-class-name=org.postgresql.Driver
spring.datasource.username=postgres
spring.datasource.password=postgres

# Pool de conexiones (HikariCP)
spring.datasource.hikari.maximum-pool-size=10
spring.datasource.hikari.minimum-idle=5
spring.datasource.hikari.connection-timeout=30000
spring.datasource.hikari.idle-timeout=600000
spring.datasource.hikari.max-lifetime=1800000

# ============================================
# CONFIGURACIÓN JPA/HIBERNATE
# ============================================

# Dialecto de PostgreSQL
spring.jpa.database-platform=org.hibernate.dialect.PostgreSQLDialect

# Estrategia de generación de esquema
# - create-drop: Crea y elimina al finalizar (ideal para desarrollo)
# - update: Actualiza esquema sin eliminar datos (recomendado para desarrollo)
# - validate: Solo valida que el esquema coincida
# - none: No hace nada (producción)
spring.jpa.hibernate.ddl-auto=update

# Mostrar SQL en consola
spring.jpa.show-sql=true
spring.jpa.properties.hibernate.format_sql=true

# No inicializar datasource antes de tiempo
spring.jpa.defer-datasource-initialization=false

# Propiedades adicionales de Hibernate
spring.jpa.properties.hibernate.jdbc.lob.non_contextual_creation=true
spring.jpa.properties.hibernate.temp.use_jdbc_metadata_defaults=false

# ============================================
# CONFIGURACIÓN DEL SERVIDOR
# ============================================

server.port=8080
server.error.include-message=always
server.error.include-binding-errors=always

# ============================================
# CONFIGURACIÓN CORS PARA FLUTTER
# ============================================

# Permitir peticiones desde Flutter (Android emulator, iOS simulator, web)
spring.web.cors.allowed-origins=http://localhost:*,http://10.0.2.2:*,http://127.0.0.1:*,http://192.168.*.*:*
spring.web.cors.allowed-methods=GET,POST,PUT,DELETE,OPTIONS,PATCH
spring.web.cors.allowed-headers=*
spring.web.cors.allow-credentials=true
spring.web.cors.max-age=3600

# ============================================
# LOGGING PARA DEBUG
# ============================================

logging.level.org.springframework.web=INFO
logging.level.org.hibernate.SQL=DEBUG
logging.level.org.hibernate.type.descriptor.sql.BasicBinder=TRACE
logging.level.org.springframework.context=DEBUG
logging.level.org.springframework.beans=DEBUG
logging.level.com.example=DEBUG
logging.level.org.postgresql=DEBUG

# ============================================
# CONFIGURACIÓN JACKSON (JSON)
# ============================================

spring.jackson.serialization.fail-on-empty-beans=false
spring.jackson.serialization.fail-on-self-references=false
spring.jackson.default-property-inclusion=non_null

# ============================================
# OTRAS CONFIGURACIONES
# ============================================

# Desactivar Open Session In View (mejor rendimiento)
spring.jpa.open-in-view=false

# Timezone
spring.jpa.properties.hibernate.jdbc.time_zone=UTC
`;
  }
  private generateMainApplication(): string {
    return `package com.example;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}`;
  }

  private generateModelMapperConfig(): string {
    return `package com.example.config;

import org.modelmapper.ModelMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class ModelMapperConfig {

    @Bean
    public ModelMapper modelMapper() {
        return new ModelMapper();
    }
}`;
  }

  private generateCorsConfig(): string {
    return `package com.example.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

import java.util.Arrays;

@Configuration
public class CorsConfig {

    @Bean
    public CorsFilter corsFilter() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowCredentials(true);
        config.setAllowedOriginPatterns(Arrays.asList("http://localhost:*", "http://127.0.0.1:*", "http://10.0.2.2:*"));
        config.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(Arrays.asList("*"));
        config.setMaxAge(3600L);
        
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return new CorsFilter(source);
    }
}`;
  }

  private generateDatabaseSetupScript(): string {
    return `-- ============================================
-- Script de Configuración PostgreSQL
-- ============================================

-- Conectarse como usuario postgres y ejecutar:
-- psql -U postgres -f setup.sql

-- Crear la base de datos
DROP DATABASE IF EXISTS uml_crud_db;
CREATE DATABASE uml_crud_db;

-- Conectarse a la base de datos
\\c uml_crud_db;

-- Crear esquema si es necesario
CREATE SCHEMA IF NOT EXISTS public;

-- Otorgar permisos
GRANT ALL PRIVILEGES ON DATABASE uml_crud_db TO postgres;
GRANT ALL PRIVILEGES ON SCHEMA public TO postgres;

-- Verificar versión
SELECT version();

-- Listar bases de datos
\\l

-- Mensaje de éxito
\\echo 'Base de datos uml_crud_db creada exitosamente!'
\\echo 'Ahora puedes ejecutar el proyecto Spring Boot'
`;
  }

  private generateDatabaseReadme(): string {
    return `# 🗄️ Configuración de Base de Datos PostgreSQL

Este directorio contiene scripts y documentación para la configuración de PostgreSQL.

## 📋 Requisitos Previos

### Instalar PostgreSQL

**Windows:**
1. Descargar desde: https://www.postgresql.org/download/windows/
2. Ejecutar el instalador
3. Durante instalación, establecer contraseña para usuario \`postgres\`
4. Marcar la casilla para instalar pgAdmin (herramienta gráfica)

**macOS:**
\`\`\`bash
brew install postgresql@15
brew services start postgresql@15
\`\`\`

**Linux (Ubuntu/Debian):**
\`\`\`bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
\`\`\`

## 🚀 Configuración Rápida

### Opción 1: Script Automático

\`\`\`bash
# Ejecutar desde este directorio
psql -U postgres -f setup.sql
\`\`\`

### Opción 2: Comandos Manuales

\`\`\`bash
# 1. Conectarse a PostgreSQL
psql -U postgres

# 2. Crear la base de datos
CREATE DATABASE uml_crud_db;

# 3. Verificar
\\l

# 4. Salir
\\q
\`\`\`

## 🔧 Configuración del Proyecto

El archivo \`application.properties\` ya está configurado con:

\`\`\`properties
spring.datasource.url=jdbc:postgresql://localhost:5432/uml_crud_db
spring.datasource.username=postgres
spring.datasource.password=postgres
\`\`\`

**⚠️ IMPORTANTE:** Si tu contraseña de PostgreSQL es diferente, actualiza:
\`\`\`
src/main/resources/application.properties
\`\`\`

## 🔐 Cambiar Contraseña de PostgreSQL

Si olvidaste la contraseña o necesitas cambiarla:

\`\`\`bash
# Linux/macOS
sudo -u postgres psql
ALTER USER postgres PASSWORD 'nueva_contraseña';

# Windows (ejecutar como Administrador en CMD)
psql -U postgres
ALTER USER postgres PASSWORD 'nueva_contraseña';
\`\`\`

## 📊 Herramientas de Administración

### 1. pgAdmin (GUI - Recomendado)
- Viene incluido con la instalación de PostgreSQL
- Interfaz gráfica completa
- Buscar "pgAdmin" en el menú de inicio

### 2. psql (CLI)
\`\`\`bash
# Conectarse a la base de datos
psql -U postgres -d uml_crud_db

# Comandos útiles
\\dt              # Listar tablas
\\d nombre_tabla  # Describir tabla
\\l               # Listar bases de datos
\\q               # Salir
\`\`\`

### 3. DBeaver (Multiplataforma)
- Descarga: https://dbeaver.io/
- Soporta múltiples bases de datos
- Interfaz moderna

## 📝 Comandos SQL Útiles

\`\`\`sql
-- Ver todas las tablas
SELECT tablename FROM pg_tables WHERE schemaname = 'public';

-- Ver datos de una tabla
SELECT * FROM nombre_tabla;

-- Contar registros
SELECT COUNT(*) FROM nombre_tabla;

-- Eliminar todos los datos (cuidado!)
TRUNCATE TABLE nombre_tabla CASCADE;

-- Ver estructura de tabla
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'nombre_tabla';
\`\`\`

## 🐛 Solución de Problemas

### Error: "role 'postgres' does not exist"
\`\`\`bash
# Crear usuario postgres
createuser -s postgres
\`\`\`

### Error: "database does not exist"
\`\`\`bash
psql -U postgres -c "CREATE DATABASE uml_crud_db;"
\`\`\`

### Error: "connection refused"
\`\`\`bash
# Verificar que PostgreSQL está corriendo
# Windows:
services.msc  # Buscar PostgreSQL

# Linux/macOS:
sudo systemctl status postgresql
\`\`\`

### Puerto 5432 en uso
\`\`\`bash
# Ver qué proceso usa el puerto
# Windows:
netstat -ano | findstr :5432

# Linux/macOS:
lsof -i :5432
\`\`\`

## 🔄 Reiniciar Base de Datos

Para empezar de cero (elimina todos los datos):

\`\`\`bash
psql -U postgres -c "DROP DATABASE IF EXISTS uml_crud_db;"
psql -U postgres -c "CREATE DATABASE uml_crud_db;"
\`\`\`

O simplemente cambia en \`application.properties\`:
\`\`\`properties
spring.jpa.hibernate.ddl-auto=create-drop  # Borra al cerrar
spring.jpa.hibernate.ddl-auto=update       # Mantiene datos
\`\`\`

## 📚 Recursos Adicionales

- Documentación oficial: https://www.postgresql.org/docs/
- Tutorial PostgreSQL: https://www.postgresqltutorial.com/
- Spring Data JPA: https://spring.io/projects/spring-data-jpa
`;
  }

  private generateReadme(): string {
    return `# Proyecto Spring Boot Generado

Proyecto generado automáticamente desde diagrama UML.

## 🚀 Instrucciones de Ejecución

### Requisitos
- Java 17 o superior
- Maven 3.6+
- PostgreSQL 12+ instalado y corriendo

### 1. Configurar Base de Datos

Ver instrucciones completas en: \`database/README.md\`

**Opción rápida:**
\`\`\`bash
# Crear base de datos
psql -U postgres -c "CREATE DATABASE uml_crud_db;"
\`\`\`

### 2. Configurar Credenciales

Editar \`src/main/resources/application.properties\` si tu contraseña es diferente:
\`\`\`properties
spring.datasource.password=tu_password_aqui
\`\`\`

### 3. Ejecutar el proyecto

\`\`\`bash
mvn spring-boot:run
\`\`\`

El servidor estará disponible en: **http://localhost:8080**

## 📱 Conexión con Flutter

### Para Android Emulator
En tu app Flutter, usa: \`http://10.0.2.2:8080\`

### Para Flutter Web/Desktop (misma PC)
En tu app Flutter, usa: \`http://localhost:8080\`

### Para dispositivo físico Android
Asegúrate de que el teléfono y la PC estén en la misma red WiFi y usa la IP local de tu PC (ej: \`http://192.168.1.100:8080\`)

## 🔧 Endpoints API

Todas las entidades tienen los siguientes endpoints:

- \`GET /api/{entidades}\` - Listar todos
- \`GET /api/{entidades}/{id}\` - Obtener por ID
- \`POST /api/{entidades}\` - Crear nuevo
- \`PUT /api/{entidades}/{id}\` - Actualizar
- \`DELETE /api/{entidades}/{id}\` - Eliminar

## 🗄️ Base de Datos PostgreSQL

### Configuración Inicial

**1. Instalar PostgreSQL:**
- Windows: Descarga desde https://www.postgresql.org/download/windows/
- macOS: \`brew install postgresql\`
- Linux: \`sudo apt install postgresql postgresql-contrib\`

**2. Crear la base de datos:**

\`\`\`bash
# Conectarse a PostgreSQL
psql -U postgres

# Crear la base de datos
CREATE DATABASE uml_crud_db;

# Verificar
\\l

# Salir
\\q
\`\`\`

**3. Configurar credenciales:**

Edita \`src/main/resources/application.properties\` si es necesario:

\`\`\`properties
spring.datasource.url=jdbc:postgresql://localhost:5432/uml_crud_db
spring.datasource.username=postgres
spring.datasource.password=tu_password_aqui
\`\`\`

### Acceso a la Base de Datos

Puedes conectarte usando:
- **psql:** \`psql -U postgres -d uml_crud_db\`
- **pgAdmin:** Herramienta gráfica incluida con PostgreSQL
- **DBeaver:** https://dbeaver.io/

### Scripts útiles

Ver tablas creadas:
\`\`\`sql
\\dt
\`\`\`

Ver contenido de una tabla:
\`\`\`sql
SELECT * FROM nombre_tabla;
\`\`\`

## 📮 Pruebas en Postman

Se ha generado un archivo con instrucciones para probar la API:
- **\`POSTMAN_TESTS.md\`** - 📋 Guía paso a paso con todas las peticiones listas para copiar y pegar

### Opción recomendada: Copiar y pegar
Abre el archivo **\`POSTMAN_TESTS.md\`** y copia las peticiones directamente en Postman. Cada petición incluye método, URL, headers y body de ejemplo.

## ⚙️ CORS

CORS ya está configurado para permitir peticiones desde:
- localhost (cualquier puerto)
- 127.0.0.1 (cualquier puerto)
- 10.0.2.2 (Android Emulator)
- 192.168.*.* (dispositivos en red local)

Si necesitas agregar más orígenes, edita \`src/main/java/com/example/config/CorsConfig.java\`
`;
  }

  private generateSampleRequestBody(cls: ClassDefinition): string {
    const data: any = {};

    // ✅ 1. Procesar atributos simples
    cls.attributes.forEach((attr, i) => {
      const { type, name } = this.parseAttribute(attr, i);

      switch (type) {
        case "String":
          data[name] = `sample_${name}`;
          break;
        case "Integer":
        case "Long":
          data[name] = 1;
          break;
        case "Double":
        case "Float":
          data[name] = 1.0;
          break;
        case "Boolean":
          data[name] = true;
          break;
        default:
          data[name] = `sample_${name}`;
      }
    });

    // ✅ 2. Procesar relaciones donde esta clase tiene la FK (lado "muchos" o propietario)
    const className = cls.name;

    this.processedRelations
      .filter((r) => r.source === className || r.target === className)
      .forEach((r) => {
        const isSource = r.source === className;
        const otherClass = isSource ? r.target : r.source;
        const otherVar = this.toCamelCase(otherClass);

        // Agregar campo {entidad}Id SOLO si esta clase tiene la FK
        let shouldAddForeignKey = false;

        switch (r.type) {
          case "MANY_TO_ONE":
            // Si esta clase es el lado "muchos", tiene la FK
            shouldAddForeignKey =
              (isSource && r.ownerSide === "source") ||
              (!isSource && r.ownerSide === "target");
            break;

          case "ONE_TO_MANY":
            // Si esta clase es el lado propietario (tiene FK), agregarla
            shouldAddForeignKey =
              (isSource && r.ownerSide === "source") ||
              (!isSource && r.ownerSide === "target");
            break;

          case "ONE_TO_ONE":
            // Si esta clase es el lado propietario (tiene FK)
            shouldAddForeignKey =
              (isSource && r.ownerSide === "source") ||
              (!isSource && r.ownerSide === "target");
            break;

          case "MANY_TO_MANY":
            // En MANY_TO_MANY no se envían IDs en el JSON, se manejan aparte
            shouldAddForeignKey = false;
            break;
        }

        if (shouldAddForeignKey) {
          const fieldName = `${otherVar}Id`;
          data[fieldName] = 1; // ID de ejemplo
        }
      });

    return JSON.stringify(data, null, 2);
  }

  /**
   * Genera notas sobre las relaciones donde la clase tiene FKs
   */
  private generateRelationshipNotes(cls: ClassDefinition): string {
    const className = cls.name;
    const notes: string[] = [];

    this.processedRelations
      .filter((r) => r.source === className || r.target === className)
      .forEach((r) => {
        const isSource = r.source === className;
        const otherClass = isSource ? r.target : r.source;
        const otherVar = this.toCamelCase(otherClass);

        let shouldAddNote = false;
        let relationDescription = "";

        switch (r.type) {
          case "MANY_TO_ONE":
            if (
              (isSource && r.ownerSide === "source") ||
              (!isSource && r.ownerSide === "target")
            ) {
              shouldAddNote = true;
              relationDescription = `pertenece a un/a ${otherClass}`;
            }
            break;

          case "ONE_TO_MANY":
            if (
              (isSource && r.ownerSide === "source") ||
              (!isSource && r.ownerSide === "target")
            ) {
              shouldAddNote = true;
              relationDescription = `pertenece a un/a ${otherClass}`;
            }
            break;

          case "ONE_TO_ONE":
            if (
              (isSource && r.ownerSide === "source") ||
              (!isSource && r.ownerSide === "target")
            ) {
              shouldAddNote = true;
              relationDescription = `está asociado/a con un/a ${otherClass}`;
            }
            break;
        }

        if (shouldAddNote) {
          notes.push(
            `- **\`${otherVar}Id\`**: ID del/la ${otherClass} (${relationDescription}). Debe ser un ID válido existente.`
          );
        }
      });

    if (notes.length === 0) {
      return "";
    }

    return `\n**⚠️ IMPORTANTE - Relaciones:**\n${notes.join("\n")}\n`;
  }

  private generateDTO(cls: ClassDefinition): string {
    const className = this.toPascal(cls.name);
    const usedFieldNames = new Set<string>();
    usedFieldNames.add("id");

    const fieldDefinitions: string[] = [];
    const imports = new Set<string>();

    // Procesar solo atributos simples
    cls.attributes.forEach((attr, i) => {
      const { type, name } = this.parseAttribute(attr, i);

      if (!usedFieldNames.has(name) && name.toLowerCase() !== "id") {
        usedFieldNames.add(name);
        fieldDefinitions.push(`    private ${type} ${name};`);
        this.addTypeImport(type, imports);
      }
    });

    const importSection = Array.from(imports).sort().join("\n");
    const importBlock = imports.size > 0 ? "\n" + importSection + "\n" : "";

    return `package ${this.packageName}.dto;

import lombok.*;${importBlock}

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ${className}DTO {
    private Long id;
${fieldDefinitions.length ? "\n" + fieldDefinitions.join("\n") + "\n" : ""}
}`;
  }

  private addTypeImport(type: string, imports: Set<string>): void {
    switch (type) {
      case "BigDecimal":
        imports.add("import java.math.BigDecimal;");
        break;
      case "LocalDate":
        imports.add("import java.time.LocalDate;");
        break;
      case "LocalDateTime":
        imports.add("import java.time.LocalDateTime;");
        break;
      case "UUID":
        imports.add("import java.util.UUID;");
        break;
    }
  }

  private generateRepository(cls: ClassDefinition): string {
    const className = this.toPascal(cls.name);
    return `package ${this.packageName}.repository;

import ${this.packageName}.model.${className};
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ${className}Repository extends JpaRepository<${className}, Long> {
}`;
  }

  private generateService(cls: ClassDefinition): string {
    const className = this.toPascal(cls.name);
    const varName = this.toCamelCase(className);
    const repoName = `${className}Repository`;
    const repoVar = `${varName}Repository`;
    const dtoName = `${className}DTO`;

    return `package ${this.packageName}.service;

import ${this.packageName}.dto.${dtoName};
import ${this.packageName}.model.${className};
import ${this.packageName}.repository.${repoName};
import org.modelmapper.ModelMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@Transactional
public class ${className}Service {

    private final ${repoName} ${repoVar};
    private final ModelMapper modelMapper;

    public ${className}Service(${repoName} ${repoVar}, ModelMapper modelMapper) {
        this.${repoVar} = ${repoVar};
        this.modelMapper = modelMapper;
    }

    @Transactional(readOnly = true)
    public List<${dtoName}> findAll() {
        return ${repoVar}.findAll().stream()
                .map(entity -> modelMapper.map(entity, ${dtoName}.class))
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public ${dtoName} findById(Long id) {
        ${className} entity = ${repoVar}.findById(id)
                .orElseThrow(() -> new RuntimeException("${className} not found with id: " + id));
        return modelMapper.map(entity, ${dtoName}.class);
    }

    public ${dtoName} create(${dtoName} dto) {
        try {
            ${className} entity = modelMapper.map(dto, ${className}.class);
            // ✅ NO usar setId(null) - Lombok @Data maneja esto
            ${className} savedEntity = ${repoVar}.save(entity);
            return modelMapper.map(savedEntity, ${dtoName}.class);
        } catch (Exception e) {
            throw new RuntimeException("Error creating ${className}: " + e.getMessage(), e);
        }
    }

    public ${dtoName} update(Long id, ${dtoName} dto) {
        try {
            ${className} existing = ${repoVar}.findById(id)
                .orElseThrow(() -> new RuntimeException("${className} not found with id: " + id));
            
            // ✅ Mapear solo los campos, preservando el ID
            Long originalId = existing.getId();
            modelMapper.map(dto, existing);
            existing.setId(originalId); // Restaurar ID original
            
            ${className} savedEntity = ${repoVar}.save(existing);
            return modelMapper.map(savedEntity, ${dtoName}.class);
        } catch (Exception e) {
            throw new RuntimeException("Error updating ${className}: " + e.getMessage(), e);
        }
    }

    public void delete(Long id) {
        try {
            if (!${repoVar}.existsById(id)) {
                throw new RuntimeException("${className} not found with id: " + id);
            }
            ${repoVar}.deleteById(id);
        } catch (Exception e) {
            throw new RuntimeException("Error deleting ${className}: " + e.getMessage(), e);
        }
    }
}`;
  }

  private generateController(cls: ClassDefinition): string {
    const className = this.toPascal(cls.name);
    const varName = this.toCamelCase(className);
    const dtoName = `${className}DTO`;
    const basePath = `"/api/${this.toPlural(varName)}"`;

    return `package ${this.packageName}.controller;

import ${this.packageName}.dto.${dtoName};
import ${this.packageName}.service.${className}Service;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping(${basePath})
public class ${className}Controller {

    private final ${className}Service ${varName}Service;

    public ${className}Controller(${className}Service ${varName}Service) {
        this.${varName}Service = ${varName}Service;
    }

    @GetMapping
    public ResponseEntity<List<${dtoName}>> getAll() {
        return ResponseEntity.ok(${varName}Service.findAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<${dtoName}> getById(@PathVariable Long id) {
        try {
            return ResponseEntity.ok(${varName}Service.findById(id));
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping
    public ResponseEntity<${dtoName}> create(@RequestBody ${dtoName} dto) {
        return ResponseEntity.ok(${varName}Service.create(dto));
    }

    @PutMapping("/{id}")
    public ResponseEntity<${dtoName}> update(@PathVariable Long id, @RequestBody ${dtoName} dto) {
        try {
            return ResponseEntity.ok(${varName}Service.update(id, dto));
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        try {
            ${varName}Service.delete(id);
            return ResponseEntity.noContent().build();
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
    }
}`;
  }

  private generatePostmanTestsGuide(): string {
    let guide = `# 📮 Guía de Pruebas en Postman

Esta guía contiene todas las peticiones HTTP para probar tu API REST generada.
Simplemente **copia y pega** cada petición en Postman y presiona **SEND**.

## 🌐 Configuración Base

**URL Base:** \`http://localhost:8080\`

---

`;

    this.classes.forEach((cls) => {
      const className = this.toPascal(cls.name);
      const endpoint = this.toPlural(className.toLowerCase());

      guide += `## 📦 Entidad: ${className}

### 1️⃣ LISTAR TODOS (GET)

\`\`\`
Método: GET
URL: http://localhost:8080/api/${endpoint}
Headers: (ninguno requerido)
Body: (ninguno)
\`\`\`

**Respuesta esperada:** Lista de objetos ${className}

---

### 2️⃣ OBTENER POR ID (GET)

\`\`\`
Método: GET
URL: http://localhost:8080/api/${endpoint}/1
Headers: (ninguno requerido)
Body: (ninguno)
\`\`\`

**Nota:** Cambia el \`1\` por el ID que desees consultar.

---

### 3️⃣ CREAR NUEVO (POST)

\`\`\`
Método: POST
URL: http://localhost:8080/api/${endpoint}
Headers: 
  Content-Type: application/json
Body (raw - JSON):
\`\`\`

\`\`\`json
${this.generateSampleRequestBody(cls)}
\`\`\`
${this.generateRelationshipNotes(cls)}
**Instrucciones:**
1. En Postman, selecciona método **POST**
2. Pega la URL: \`http://localhost:8080/api/${endpoint}\`
3. Ve a la pestaña **Headers**
4. Agrega: \`Content-Type\` = \`application/json\`
5. Ve a la pestaña **Body** → selecciona **raw** → selecciona **JSON**
6. Pega el JSON de arriba
7. Presiona **SEND**

---

### 4️⃣ ACTUALIZAR (PUT)

\`\`\`
Método: PUT
URL: http://localhost:8080/api/${endpoint}/1
Headers: 
  Content-Type: application/json
Body (raw - JSON):
\`\`\`

\`\`\`json
${this.generateSampleRequestBody(cls)}
\`\`\`
${this.generateRelationshipNotes(cls)}
**Nota:** 
- Cambia el \`1\` en la URL por el ID del registro que quieres actualizar
- El body debe incluir los datos actualizados

**Instrucciones:**
1. En Postman, selecciona método **PUT**
2. Pega la URL: \`http://localhost:8080/api/${endpoint}/1\` (cambia el ID)
3. Ve a la pestaña **Headers**
4. Agrega: \`Content-Type\` = \`application/json\`
5. Ve a la pestaña **Body** → selecciona **raw** → selecciona **JSON**
6. Pega el JSON de arriba con los datos actualizados
7. Presiona **SEND**

---

### 5️⃣ ELIMINAR (DELETE)

\`\`\`
Método: DELETE
URL: http://localhost:8080/api/${endpoint}/1
Headers: (ninguno requerido)
Body: (ninguno)
\`\`\`

**Nota:** Cambia el \`1\` por el ID del registro que deseas eliminar.

**Instrucciones:**
1. En Postman, selecciona método **DELETE**
2. Pega la URL: \`http://localhost:8080/api/${endpoint}/1\` (cambia el ID)
3. Presiona **SEND**

**Respuesta esperada:** 
- Código 204 (No Content) si se eliminó correctamente
- Código 404 (Not Found) si no existe el ID

---

`;
    });

    guide += `## 🔧 Consejos para usar Postman

### Crear una Collection
1. En Postman, haz clic en **Collections** → **New Collection**
2. Nómbrala "Spring Boot API Tests"
3. Crea una carpeta para cada entidad
4. Dentro de cada carpeta, crea las 5 peticiones (GET, GET/:id, POST, PUT, DELETE)

### Usar Variables de Entorno
1. En Postman, crea un Environment llamado "Local"
2. Agrega variable: \`base_url\` = \`http://localhost:8080\`
3. Usa \`{{base_url}}/api/${this.toPlural(
      this.classes[0]?.name.toLowerCase() || "entities"
    )}\` en tus URLs

---

## ✅ Verificación de Respuestas

### Códigos HTTP comunes:
- \`200 OK\` - Petición exitosa (GET, PUT)
- \`201 Created\` - Recurso creado exitosamente (POST)
- \`204 No Content\` - Eliminación exitosa (DELETE)
- \`404 Not Found\` - Recurso no encontrado
- \`500 Internal Server Error\` - Error en el servidor

### Verificar que funciona:
1. **Primero:** Ejecuta el proyecto Spring Boot (\`mvn spring-boot:run\`)
2. **Luego:** Prueba el endpoint de listar (GET) - debe retornar \`[]\` o datos existentes
3. **Después:** Crea un registro con POST
4. **Finalmente:** Prueba los demás endpoints

---

## 🐛 Solución de Problemas

### Error: "Connection refused"
- ✅ Verifica que Spring Boot esté corriendo en puerto 8080
- ✅ Revisa los logs de la consola

### Error: 404 Not Found en POST/PUT
- ✅ Verifica que la URL sea correcta: \`/api/${this.toPlural(
      this.classes[0]?.name.toLowerCase() || "entities"
    )}\`
- ✅ Asegúrate de incluir \`/api\` en la ruta

### Error: 400 Bad Request
- ✅ Verifica que el header \`Content-Type: application/json\` esté presente
- ✅ Revisa que el JSON esté bien formado (sin comas finales, comillas correctas)

### Error: 500 Internal Server Error
- ✅ Revisa los logs de Spring Boot en la consola
- ✅ Verifica que PostgreSQL esté corriendo y conectado

---

## 📚 Ejemplos Completos

### Ejemplo: Crear y luego Actualizar

**Paso 1 - Crear (POST):**
\`\`\`
POST http://localhost:8080/api/${this.toPlural(
      this.classes[0]?.name.toLowerCase() || "entities"
    )}
Content-Type: application/json

${
  this.classes[0]
    ? this.generateSampleRequestBody(this.classes[0])
    : '{"example": "value"}'
}
\`\`\`

**Paso 2 - La respuesta te dará un ID, por ejemplo:** \`{"id": 1, ...}\`

**Paso 3 - Actualizar ese registro (PUT):**
\`\`\`
PUT http://localhost:8080/api/${this.toPlural(
      this.classes[0]?.name.toLowerCase() || "entities"
    )}/1
Content-Type: application/json

${
  this.classes[0]
    ? this.generateSampleRequestBody(this.classes[0])
    : '{"example": "updated value"}'
}
\`\`\`

---

🎉 **¡Listo! Ya puedes probar tu API REST completa en Postman**
`;

    return guide;
  }
}
