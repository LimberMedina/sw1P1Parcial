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

type ParsedAttr = { type: string; name: string };

export class JavaSpringGenerator {
  private classes: ClassDefinition[] = [];
  private relations: RelationDefinition[] = [];
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

    // Procesar relaciones (resto igual)
    const className = cls.name;
    const thisVar = this.toCamelCase(className);

    this.relations
      .filter((r) => r.source === className || r.target === className)
      .forEach((r) => {
        const isSource = r.source === className;
        const otherClass = isSource ? r.target : r.source;
        const otherVar = this.toCamelCase(otherClass);
        const collNameFromOther = this.toPlural(otherVar);

        // ✅ EVITAR RELACIONES DUPLICADAS
        const relationFieldName = isSource
          ? otherVar
          : r.type === "ONE_TO_MANY" || r.type === "MANY_TO_MANY"
          ? collNameFromOther
          : otherVar;

        if (usedFieldNames.has(relationFieldName)) {
          return; // Saltar si ya existe
        }
        usedFieldNames.add(relationFieldName);

        switch (r.type) {
          case "ONE_TO_ONE": {
            if (isSource) {
              lines.push(
                `    @OneToOne(cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @JoinColumn(name = "${this.toCamelCase(otherClass)}_id")
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private ${otherClass} ${otherVar};`
              );
            } else if (r.bidirectional) {
              lines.push(
                `    @OneToOne(mappedBy = "${otherVar}", fetch = FetchType.LAZY)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private ${otherClass} ${otherVar};`
              );
            }
            break;
          }

          case "MANY_TO_ONE": {
            if (isSource) {
              lines.push(
                `    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "${this.toCamelCase(otherClass)}_id")
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private ${otherClass} ${otherVar};`
              );
            } else if (r.bidirectional) {
              lines.push(
                `    @OneToMany(mappedBy = "${this.toCamelCase(
                  className
                )}", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private Set<${otherClass}> ${collNameFromOther} = new HashSet<>();`
              );
            }
            break;
          }

          case "ONE_TO_MANY": {
            if (isSource) {
              lines.push(
                `    @OneToMany(mappedBy = "${thisVar}", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private Set<${otherClass}> ${this.toPlural(otherVar)} = new HashSet<>();`
              );
            } else {
              lines.push(
                `    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "${this.toCamelCase(otherClass)}_id")
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private ${otherClass} ${otherVar};`
              );
            }
            break;
          }

          case "MANY_TO_MANY": {
            if (isSource) {
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
    private Set<${otherClass}> ${this.toPlural(otherVar)} = new HashSet<>();`
              );
            } else if (r.bidirectional) {
              lines.push(
                `    @ManyToMany(mappedBy = "${this.toPlural(
                  this.toCamelCase(otherClass)
                )}", fetch = FetchType.LAZY)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private Set<${otherClass}> ${this.toPlural(otherVar)} = new HashSet<>();`
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
    const result: Record<string, string> = {};

    result["pom.xml"] = this.generatePomXml();
    result["src/main/resources/application.properties"] =
      this.generateApplicationProperties();
    result["src/main/java/com/example/Application.java"] =
      this.generateMainApplication();
    result["src/main/java/com/example/config/ModelMapperConfig.java"] =
      this.generateModelMapperConfig();

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

    result["postman-collection.json"] = this.generatePostmanCollection();
    result["postman-environment.json"] = this.generatePostmanEnvironment();

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
        <dependency>
            <groupId>com.h2database</groupId>
            <artifactId>h2</artifactId>
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
    return `# Configuración de base de datos H2 (en memoria para desarrollo)
spring.datasource.url=jdbc:h2:mem:testdb
spring.datasource.driver-class-name=org.h2.Driver
spring.datasource.username=sa
spring.datasource.password=

# JPA/Hibernate configuración
spring.jpa.database-platform=org.hibernate.dialect.H2Dialect
spring.jpa.hibernate.ddl-auto=create-drop
spring.jpa.show-sql=true
spring.jpa.defer-datasource-initialization=true

# H2 Console
spring.h2.console.enabled=true
spring.h2.console.path=/h2-console

# Configuración del servidor
server.port=8080

# ✅ LOGGING DETALLADO PARA DEBUG
logging.level.org.springframework.web=INFO
logging.level.org.hibernate=INFO
logging.level.org.springframework.context=DEBUG
logging.level.org.springframework.beans=DEBUG
logging.level.com.example=DEBUG

# Jackson configuración
spring.jackson.serialization.fail-on-empty-beans=false
spring.jackson.serialization.fail-on-self-references=false

# ✅ Desactivar inicialización automática problemática
spring.jpa.open-in-view=false
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

  private generatePostmanCollection(): string {
    const collectionName = "Generated API";
    const collection = {
      info: {
        name: collectionName,
        description: "Colección generada automáticamente",
        schema:
          "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      },
      item: this.classes.map((cls) => {
        const className = this.toPascal(cls.name);
        const endpoint = this.toPlural(this.toCamelCase(className));

        return {
          name: `${className} CRUD`,
          item: [
            {
              name: `Get All ${this.toPlural(className)}`,
              request: {
                method: "GET",
                header: [{ key: "Accept", value: "application/json" }],
                url: {
                  raw: `{{base_url}}/api/${endpoint}`,
                  host: ["{{base_url}}"],
                  path: ["api", endpoint],
                },
              },
            },
            {
              name: `Create ${className}`,
              request: {
                method: "POST",
                header: [
                  { key: "Content-Type", value: "application/json" },
                  { key: "Accept", value: "application/json" },
                ],
                body: {
                  mode: "raw",
                  raw: this.generateSampleRequestBody(cls),
                },
                url: {
                  raw: `{{base_url}}/api/${endpoint}`,
                  host: ["{{base_url}}"],
                  path: ["api", endpoint],
                },
              },
            },
          ],
        };
      }),
      variable: [
        {
          key: "base_url",
          value: "http://localhost:8080",
          type: "string",
        },
      ],
    };

    return JSON.stringify(collection, null, 2);
  }

  private generatePostmanEnvironment(): string {
    const environment = {
      id: `${Date.now()}-env`,
      name: "Generated Environment",
      values: [
        {
          key: "base_url",
          value: "http://localhost:8080",
          enabled: true,
          type: "default",
        },
      ],
      _postman_variable_scope: "environment",
    };

    return JSON.stringify(environment, null, 2);
  }

  private generateSampleRequestBody(cls: ClassDefinition): string {
    const data: any = {};

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

    return JSON.stringify(data, null, 2);
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
}
