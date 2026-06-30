const fs = require("fs");
const path = require("path");
const request = require("supertest");

const TEST_AGENDA_FILE = path.join(__dirname, "agenda.test-data.json");

process.env.AGENDA_FILE = TEST_AGENDA_FILE;

const app = require("../index");

function seedAgenda() {
  const initial = {
    activities: [
      {
        id: 1,
        title: "Reuniao",
        date: "2026-06-30",
        time: "09:00",
        description: "Sprint"
      }
    ]
  };

  fs.writeFileSync(TEST_AGENDA_FILE, JSON.stringify(initial, null, 2) + "\n", "utf-8");
}

describe("Agenda API", () => {
  beforeEach(() => {
    seedAgenda();
  });

  afterAll(() => {
    if (fs.existsSync(TEST_AGENDA_FILE)) {
      fs.unlinkSync(TEST_AGENDA_FILE);
    }
  });

  test("GET /agenda?date com formato invalido retorna 400", async () => {
    const response = await request(app).get("/agenda?date=30-06-2026");

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Formato de date invalido/);
  });

  test("CRUD completo: POST -> GET by id -> PUT -> DELETE", async () => {
    const createResponse = await request(app)
      .post("/agenda")
      .send({
        title: "Estudar testes",
        date: "2026-06-30",
        time: "20:00",
        description: "Jest e Supertest"
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.id).toBeDefined();

    const createdId = createResponse.body.id;

    const getByIdResponse = await request(app).get(`/agenda/${createdId}`);
    expect(getByIdResponse.status).toBe(200);
    expect(getByIdResponse.body.title).toBe("Estudar testes");

    const updateResponse = await request(app)
      .put(`/agenda/${createdId}`)
      .send({
        title: "Estudar testes atualizado",
        date: "2026-06-30",
        time: "21:00",
        description: "CRUD completo"
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.title).toBe("Estudar testes atualizado");

    const deleteResponse = await request(app).delete(`/agenda/${createdId}`);
    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.ok).toBe(true);

    const getAfterDeleteResponse = await request(app).get(`/agenda/${createdId}`);
    expect(getAfterDeleteResponse.status).toBe(404);
  });

  test("POST com hora invalida retorna 400", async () => {
    const response = await request(app)
      .post("/agenda")
      .send({
        title: "Hora invalida",
        date: "2026-06-30",
        time: "25:61"
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Formato de time invalido/);
  });
});
