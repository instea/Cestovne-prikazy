node {
    stage 'Checkout'
    checkout scm

    catchError {
      stage 'Tests'
      sh 'sh bin/test.sh'

      stage 'Build'
      sh 'docker build -t cestaky:master .'

      stage 'Deploy'
      sh 'cd $DEPLOY_DIR; docker-compose up -d'
    }
    step([$class: 'Mailer', notifyEveryUnstableBuild: true, recipients: 'dev@instea.co', sendToIndividuals: true])
}
