import { toSnakeCase } from '../../utils/utils.js';

export default async function membersRoutes(app) {
  app.addHook('preValidation', app.authenticate);

  app.post('/members',
    {
      schema: {
	body: {
	  type: 'object',
	  properties: {
	    firstname: { type: 'string' },
	    lastname: { type: 'string' },
	    age: { type: 'number', nullable: false, minimum: 14 },
	    email: { type: 'string', nullable: false },
	    isActive: { type: 'boolean', nullable: false, default: true },
	    fideRating: { type: 'number', nullable: true, minimum: 1, default: null },
	    profilePhotoUrl: { type: 'string', nullable: true, default: null },
	    lichessProfile: { type: 'string', nullable: true, default: null },
	    chessComProfile: { type: 'string', nullable: true, default: null },
	    fideProfile: { type: 'string', nullable: true, default: null },
	    overDueSubscription: { type: 'boolean', nullable: false, default: false },
	    gender: { type: 'string', enum: ['Male', 'Female', 'Other'] },
	  },
	  required: ['firstname', 'lastname', 'age', 'email', 'gender'],
	},
      },
    },
    async(req, res) => {
      const { firstname, lastname, age, email, isActive, fideRating, profilePhotoUrl,
	lichessProfile, chessComProfile, overDueSubscription, gender } = req.body;

      try {
	const insertMember = await app.pg.query(`
        INSERT INTO members (firstname, lastname, age, email, is_active, fide_rating,
        profile_photo_url, lichess_profile, chesscom_profile, overdue_subscription, gender)
        VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
	  [firstname, lastname, age, email, isActive, fideRating, profilePhotoUrl, lichessProfile,
	    chessComProfile, overDueSubscription, gender]
	);
	return { id: insertMember.rows[0].id };
      } catch(error) {
	res.code(error.statusCode || 500);
	req.log.error(error);
	return { msg: 'Could not add new member' };
      }
    });

  app.get('/members', {
    schema: {
      response: {
	200: {
	  type: 'object',
	  properties: {
	    members: { type: 'array' },
	    count: { type: 'number' }
	  },
	  querystring: {
	    search: { type: 'string' }
	  }
	},
      },
    },
  },
    async(req, res) => {
      const { search } = req.query;
      const searchFilter = search ?
	` AND( firstname ILIKE '${search}%' OR lastname ILIKE '${search}' OR email ILIKE '${search}' )` : '';
    try {
      const members = await app.pg.query(`SELECT * FROM members WHERE 1=1 ${searchFilter} ORDER BY joined_at DESC`);
      return { members: members.rows, count: members.rowCount };
    } catch(error) {
      res.code(error.statusCode || 500);
      req.log.error(error);
      return { msg: 'Could not fetch members' };
    }
    });

  app.get('/members/:id', {
    schema: {
      params: {
	type: 'object',
	properties: {
	  id: { type: 'string' },
	},
	required: ['id'],
      },
      /*
      response: {
	200: {
	  type: 'object',
	  properties: {
	    id: { type: 'string' }
	  }
	}
      }
       */
    },
  },
    async(req, res) => {
      try {
	const { id } = req.params;
	const member = await app.pg.query(
	  `SELECT id, firstname, lastname, age, gender, email, is_active, fide_rating,
           overdue_subscription, lichess_profile, chesscom_profile, fide_profile,
           joined_at
           FROM members WHERE id = $1`
	  , [id]);
	if(member.rows.length === 0) {
	  return res.code(404).send({ message: 'Member not found' });
	}
	console.log('member: ', member.rows[0]);
	return member.rows[0];
      } catch(error) {
	res.code(error.statusCode || 500);
	req.log.error(error);
	return { msg: 'Could not fetch member' };
      }
    });

  app.patch('/members/:id',
    async(req, res) => {
      const { id } = req.params;
      const bodyData = req.body;

      try {
	const member = await app.pg.query('SELECT id FROM members WHERE id = $1', [id]);
	if(member.rows.length === 0) {
	  return res.code(404).send({ message: 'Member not found' });
	}
	if(Object.keys(bodyData).length == 0) {
	  return res.code(404).send({ message: 'No fields provided' });
	}

	Object.keys(bodyData).forEach(key => {
	  if (bodyData[key] === '') {
	    bodyData[key] = null;
	  }
	});

	const setClause = Object.keys(bodyData).map((key, index) => { return `${toSnakeCase(key)} = $${index + 1}`;}).join(', ');

	const sql = `UPDATE members SET ${setClause} WHERE id = $${Object.keys(bodyData).length + 1}`;
	const values = [...Object.values(bodyData), id];

	await app.pg.query(sql, values);

	res.code(200).send();

      } catch(error) {
	res.code(error.statusCode || 500);
	req.log.error(error);
	return { msg: 'Could not fetch member' };
      }
    });

  app.delete('/members/:id', async (req, res) => {
    const { id } = req.params;

    try {
      if (!id) { // TODO: use schema instead
        return res.code(400).send({ message: 'ID is required' });
      }

      const result = await app.pg.query(`
            WITH deleted_member_contacts AS (
                DELETE FROM member_contacts
                WHERE member_id = $1
                RETURNING *
            )
            DELETE FROM members WHERE id = $1
            RETURNING id
        `, [id]);

      if (result.rows.length > 0) {
        res.code(204).send();
      } else {
        res.code(404).send();
      }
    } catch(error) {
      res.code(error.statusCode || 500).send({ message: 'Could not delete member' });
      req.log.error(error);
    }
  });

}
